import { cookies } from "next/headers";
import { listAdminUsers } from "@/features/admin/api";
import { AdminUsersTable } from "@/features/admin/admin-users-table";

export default async function AdminPage() {
  const cookieHeader = (await cookies()).toString();
  const users = await listAdminUsers(cookieHeader);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Admin</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage users, roles, and workspace plans.
        </p>
      </div>

      <AdminUsersTable initialUsers={users} />
    </div>
  );
}
