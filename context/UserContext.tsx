'use client';

import React, { createContext, useContext } from 'react';

export type User = {
  $id: string;
  accountId: string;
  fullName: string;
  avatar: string;
  email: string;
};

const UserContext = createContext<User | null>(null);

export const useUser = () => useContext(UserContext);

export const UserProvider = ({
  user,
  children,
}: {
  user: User;
  children: React.ReactNode;
}) => {
  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
};
