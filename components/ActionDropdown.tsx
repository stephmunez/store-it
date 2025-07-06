'use client';

import { FileDetails, ShareInput } from '@/components/ActionsModalContent';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { actionsDropdownItems } from '@/constants';
import { useUser } from '@/context/UserContext';
import {
  deleteFile,
  renameFile,
  updateFileUsers,
} from '@/lib/actions/file.actions';
import { constructDownloadUrl } from '@/lib/utils';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Models } from 'node-appwrite';
import { useState } from 'react';

const ActionDropdown = ({ file }: { file: Models.Document }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [action, setAction] = useState<ActionType | null>(null);
  const [name, setName] = useState(file.name);
  const [emails, setEmails] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const path = usePathname();
  const currentUser = useUser();

  const closeAllModals = () => {
    setIsModalOpen(false);
    setIsDropdownOpen(false);
    setAction(null);
    setName(file.name);
  };

  const handleAction = async () => {
    if (!action) {
      return;
    }
    let success = false;
    setIsLoading(true);

    const actions = {
      rename: () =>
        renameFile({ fileId: file.$id, name, extension: file.extension, path }),
      share: () => updateFileUsers({ fileId: file.$id, emails, path }),
      remove: () => handleRemoveUser(currentUser?.email),
      delete: () =>
        deleteFile({ fileId: file.$id, bucketFileId: file.bucketFileId, path }),
    };

    success = await actions[action.value as keyof typeof actions]();

    if (success) {
      closeAllModals();
    }

    setIsLoading(false);
  };

  const handleRemoveUser = async (emailToRemove: string | undefined) => {
    const fileUsers = file.users || [];
    const ownerEmail = file.owner?.email;

    const updatedUsers = fileUsers.filter(
      (userEmail: string) =>
        userEmail !== emailToRemove && userEmail !== ownerEmail
    );

    const success = await updateFileUsers({
      fileId: file.$id,
      emails: updatedUsers,
      path,
      mode: 'overwrite',
    });

    if (success) {
      setEmails(updatedUsers);
    }
  };

  const renderDialogContent = () => {
    if (!action) {
      return null;
    }

    const { value, label } = action;

    return (
      <DialogContent className="shad-dialog button">
        <DialogHeader className="flex flex-col gap-3">
          <DialogTitle className="text-center text-light-100">
            {label}
          </DialogTitle>

          {value === 'rename' && (
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}

          {value === 'details' && <FileDetails file={file} />}

          {value === 'share' && (
            <ShareInput
              file={file}
              onInputChange={setEmails}
              onRemove={handleRemoveUser}
            />
          )}

          {value === 'remove' && (
            <p className="delete-confirmation">
              Are you sure you want to remove yourself from{` `}
              <span className="delete-file-name">{file.name}</span>?
            </p>
          )}

          {value === 'delete' && (
            <p className="delete-confirmation">
              Are you sure you want to delete{` `}
              <span className="delete-file-name">{file.name}</span>?
            </p>
          )}
        </DialogHeader>

        {(['rename', 'delete', 'share'].includes(value) &&
          file.owner.email === currentUser?.email) ||
        (value === 'remove' && file.owner.email !== currentUser?.email) ? (
          <DialogFooter className="flex flex-col gap-3 md:flex-row">
            <Button onClick={closeAllModals} className="modal-cancel-button">
              Cancel
            </Button>
            <Button onClick={handleAction} className="modal-submit-button">
              <p className="capitalize">{value}</p>
              {isLoading && (
                <Image
                  src="/assets/icons/loader.svg"
                  alt="loader"
                  width={24}
                  height={24}
                  className="animate-spin"
                />
              )}
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    );
  };

  return (
    <>
      <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
        <DropdownMenuTrigger className="shad-no-focus">
          <Image
            src="/assets/icons/dots.svg"
            alt="dots"
            width={34}
            height={34}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel className="max-w-[200px] truncate">
            {file.name}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {actionsDropdownItems
            .filter((actionItem) => {
              const isOwner = file.owner?.email === currentUser?.email;

              if (['rename', 'delete', 'share'].includes(actionItem.value)) {
                return isOwner;
              }

              if (actionItem.value === 'remove' && isOwner) {
                return false;
              }

              return true;
            })
            .map((actionItem) => (
              <DropdownMenuItem
                key={actionItem.value}
                className="shad-dropdown-item"
                onClick={() => {
                  setAction(actionItem);

                  if (
                    ['rename', 'share', 'delete', 'details', 'remove'].includes(
                      actionItem.value
                    )
                  ) {
                    setIsDropdownOpen(false);
                    setTimeout(() => {
                      setIsModalOpen(true);
                    }, 10);
                  }
                }}
              >
                {actionItem.value === 'download' ? (
                  <Link
                    href={constructDownloadUrl(file.bucketFileId)}
                    download={file.name}
                    className="flex items-center gap-2"
                  >
                    <Image
                      src={actionItem.icon}
                      alt={actionItem.label}
                      width={30}
                      height={30}
                    />
                    {actionItem.label}
                  </Link>
                ) : (
                  <div className="flex items-center gap-2">
                    <Image
                      src={actionItem.icon}
                      alt={actionItem.label}
                      width={30}
                      height={30}
                    />
                    {actionItem.label}
                  </div>
                )}
              </DropdownMenuItem>
            ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        {renderDialogContent()}
      </Dialog>
    </>
  );
};
export default ActionDropdown;
