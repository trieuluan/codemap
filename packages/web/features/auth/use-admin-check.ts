"use client";

import useSWR from "swr";
import { requestApi } from "@/lib/api/client";

interface MeResponse {
  roles: string[];
}

function fetchMe() {
  return requestApi<MeResponse>("/auth/me");
}

export function useAdminCheck() {
  const { data, isLoading } = useSWR("auth-me-roles", fetchMe, {
    revalidateOnFocus: false,
  });

  return {
    isAdmin: data?.roles.includes("admin") ?? false,
    isLoading,
  };
}
