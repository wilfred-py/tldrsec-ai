"use client";

import { ClerkProvider } from "@clerk/nextjs";
import React from "react";

export default function ClientClerkProvider({ children }: { children: React.ReactNode }) {
  // ClerkProvider will only run in the browser (no server-side validation during build)
  return <ClerkProvider>{children}</ClerkProvider>;
}