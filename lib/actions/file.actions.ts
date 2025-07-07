'use server';
import { getCurrentUser } from '@/lib/actions/user.actions';
import { createAdminClient } from '@/lib/appwrite';
import { appwriteConfig } from '@/lib/appwrite/config';
import { constructFileUrl, getFileType, parseStringify } from '@/lib/utils';
import { revalidatePath } from 'next/cache';
import { ID, Models, Query } from 'node-appwrite';
import { InputFile } from 'node-appwrite/file';

const handleError = (error: unknown, message: string) => {
  console.log(error, message);
  throw error;
};

export const uploadFile = async ({
  file,
  ownerId,
  accountId,
  path,
}: UploadFileProps) => {
  const { storage, databases } = await createAdminClient();

  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) throw new Error('User not found');

    const inputFile = InputFile.fromBuffer(file, file.name);

    const bucketFile = await storage.createFile(
      appwriteConfig.bucketId,
      ID.unique(),
      inputFile
    );

    const fileDocument = {
      type: getFileType(bucketFile.name).type,
      name: bucketFile.name,
      url: constructFileUrl(bucketFile.$id),
      extension: getFileType(bucketFile.name).extension,
      size: bucketFile.sizeOriginal,
      owner: ownerId,
      accountId,
      users: [],
      bucketFileId: bucketFile.$id,
    };

    const newFile = await databases
      .createDocument(
        appwriteConfig.databaseId,
        appwriteConfig.filesCollectionId,
        ID.unique(),
        fileDocument
      )
      .catch(async (error: unknown) => {
        await storage.deleteFile(appwriteConfig.bucketId, bucketFile.$id);
        handleError(error, 'Failed to create file document');
      });

    revalidatePath(path);
    return parseStringify(newFile);
  } catch (error) {
    handleError(error, 'Failed to upload file');
  }
};

const createQueries = (
  currentUser: Models.Document,
  types: string[],
  searchText: string,
  sort: string,
  limit?: number
) => {
  const queries = [
    Query.or([
      Query.equal('owner', [currentUser.$id]),
      Query.contains('users', [currentUser.email]),
    ]),
  ];

  if (types.length > 0) {
    queries.push(Query.equal('type', types));
  }

  if (searchText) {
    queries.push(Query.contains('name', searchText));
  }

  if (limit) {
    queries.push(Query.limit(limit));
  }

  if (sort) {
    const [sortBy, orderBy] = sort.split('-');

    queries.push(
      orderBy === 'asc' ? Query.orderAsc(sortBy) : Query.orderDesc(sortBy)
    );
  }

  return queries;
};

export const getFiles = async ({
  types = [],
  searchText = '',
  sort = '$createdAt-desc',
  limit,
}: GetFilesProps) => {
  const { databases } = await createAdminClient();

  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) throw new Error('User not found');

    const queries = createQueries(currentUser, types, searchText, sort, limit);

    const files = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.filesCollectionId,
      queries
    );

    console.log({ files });
    return parseStringify(files);
  } catch (error) {
    handleError(error, 'Failed to get files');
  }
};

export const renameFile = async ({
  fileId,
  name,
  extension,
  path,
}: RenameFileProps) => {
  const { databases } = await createAdminClient();

  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) throw new Error('User not found');

    const fileDoc = await databases.getDocument(
      appwriteConfig.databaseId,
      appwriteConfig.filesCollectionId,
      fileId
    );

    const ownerEmail = fileDoc.owner?.email;

    if (currentUser.email !== ownerEmail) {
      throw new Error('Forbidden: Only the owner can delete this file');
    }

    const newName = name.endsWith(extension) ? name : `${name}.${extension}`;

    const updatedFile = await databases.updateDocument(
      appwriteConfig.databaseId,
      appwriteConfig.filesCollectionId,
      fileId,
      {
        name: newName,
      }
    );

    revalidatePath(path);
    return parseStringify(updatedFile);
  } catch (error) {
    handleError(error, 'Failed to rename file');
  }
};

export const updateFileUsers = async ({
  fileId,
  emails,
  path,
  mode = 'append',
}: UpdateFileUsersProps) => {
  const { databases } = await createAdminClient();

  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) throw new Error('User not found');

    const fileDoc = await databases.getDocument(
      appwriteConfig.databaseId,
      appwriteConfig.filesCollectionId,
      fileId
    );

    const existingFileUsers: string[] = fileDoc.users || [];
    const ownerEmail = fileDoc.owner?.email;

    const filteredEmails = emails.filter((email) => email !== ownerEmail);

    let updatedFileUsers: string[];

    if (mode === 'overwrite') {
      updatedFileUsers = filteredEmails;
    } else {
      updatedFileUsers = Array.from(
        new Set([...existingFileUsers, ...filteredEmails])
      );
    }

    const isOwner = currentUser.email === ownerEmail;
    const isExistingUser = existingFileUsers.includes(currentUser.email);

    if (!isOwner) {
      if (!isExistingUser) {
        throw new Error('Forbidden: You are not allowed to modify this file');
      }

      const usersBeingRemoved = existingFileUsers.filter(
        (email) => !updatedFileUsers.includes(email)
      );

      const isOnlyRemovingSelf =
        usersBeingRemoved.length === 1 &&
        usersBeingRemoved[0] === currentUser.email;

      if (!isOnlyRemovingSelf) {
        throw new Error('Forbidden: You can only remove yourself');
      }
    }

    const hasChanges =
      updatedFileUsers.length !== existingFileUsers.length ||
      updatedFileUsers.some((email) => !existingFileUsers.includes(email));

    if (!hasChanges) {
      return parseStringify(fileDoc);
    }

    const updatedFile = await databases.updateDocument(
      appwriteConfig.databaseId,
      appwriteConfig.filesCollectionId,
      fileId,
      {
        users: updatedFileUsers,
      }
    );

    await revalidatePath(path);
    return parseStringify(updatedFile);
  } catch (error) {
    handleError(error, 'Failed to update file users');
  }
};

export const deleteFile = async ({
  fileId,
  bucketFileId,
  path,
}: DeleteFileProps) => {
  const { databases, storage } = await createAdminClient();

  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) throw new Error('User not found');

    const fileDoc = await databases.getDocument(
      appwriteConfig.databaseId,
      appwriteConfig.filesCollectionId,
      fileId
    );

    const ownerEmail = fileDoc.owner?.email;

    if (currentUser.email !== ownerEmail) {
      throw new Error('Forbidden: Only the owner can delete this file');
    }

    const deletedFile = await databases.deleteDocument(
      appwriteConfig.databaseId,
      appwriteConfig.filesCollectionId,
      fileId
    );

    if (deletedFile) {
      await storage.deleteFile(appwriteConfig.bucketId, bucketFileId);
    }

    revalidatePath(path);
    return parseStringify({ status: 'success' });
  } catch (error) {
    handleError(error, 'Failed to delete file');
  }
};
