import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import PageMeta from "../../components/common/PageMeta";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import Badge from "../../components/ui/badge/Badge";
import Button from "../../components/ui/button/Button";
import { Modal } from "../../components/ui/modal";
import Label from "../../components/form/Label";
import Input from "../../components/form/input/InputField";
import Select from "../../components/form/Select";
import { useAuth } from "../../context/AuthContext";
import {
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  getAuditLogs,
  type User,
  type AuditLog,
} from "../../services/userService";

const ROLE_COLORS: Record<string, "success" | "primary" | "warning" | "info"> = {
  SUPERADMIN: "warning",
  ADMIN: "primary",
  STAFF: "info",
  USER: "success",
};

interface EditUserData {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
}

export default function UserManagement() {
  const { isAdmin, isSuperAdmin, user: me } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("USER");

  const [showEditModal, setShowEditModal] = useState(false);
  const [editData, setEditData] = useState<EditUserData | null>(null);

  const [showAudit, setShowAudit] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  async function fetchUsers() {
    try {
      const data = await getUsers();
      setUsers(data);
    } catch (err) {
      console.error("Failed to fetch users", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isAdmin) {
      navigate("/", { replace: true });
      return;
    }
    fetchUsers();
  }, [isAdmin, navigate]);

  async function handleCreateUser() {
    if (!newEmail || !newName) return;
    try {
      await createUser({ email: newEmail, name: newName, role: newRole });
      resetModal();
      await fetchUsers();
    } catch (err) {
      console.error("Failed to create user", err);
    }
  }

  function resetModal() {
    setShowModal(false);
    setNewEmail("");
    setNewName("");
    setNewRole("USER");
  }

  function openEdit(user: User) {
    setEditData({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
    });
    setShowEditModal(true);
  }

  async function handleEditSave() {
    if (!editData) return;
    try {
      await updateUser(editData.id, {
        name: editData.name,
        role: editData.role,
        isActive: editData.isActive,
      });
      setShowEditModal(false);
      setEditData(null);
      await fetchUsers();
    } catch (err) {
      console.error("Failed to update user", err);
    }
  }

  async function handleDelete(userId: string, email: string) {
    if (!window.confirm(`Delete user ${email}? This cannot be undone.`)) return;
    try {
      await deleteUser(userId);
      await fetchUsers();
    } catch (err) {
      console.error("Failed to delete user", err);
    }
  }

  async function handleToggleActive(userId: string, current: boolean) {
    try {
      await updateUser(userId, { isActive: !current });
      await fetchUsers();
    } catch (err) {
      console.error("Failed to toggle user status", err);
    }
  }

  async function openAudit() {
    setAuditLoading(true);
    setShowAudit(true);
    try {
      const logs = await getAuditLogs();
      setAuditLogs(logs);
    } catch (err) {
      console.error("Failed to fetch audit logs", err);
    } finally {
      setAuditLoading(false);
    }
  }

  const roleOptions = isSuperAdmin
    ? [
        { value: "USER", label: "USER" },
        { value: "STAFF", label: "STAFF" },
        { value: "ADMIN", label: "ADMIN" },
      ]
    : [
        { value: "USER", label: "USER" },
        { value: "STAFF", label: "STAFF" },
      ];

  return (
    <>
      <PageMeta
        title="User Management | Dashboard"
        description="Manage users and their roles"
      />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-title-sm font-semibold text-gray-800 dark:text-white/90">
            User Management
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Manage all users and their roles
          </p>
        </div>
        <div className="flex gap-3">
          {isSuperAdmin && (
            <Button size="sm" variant="outline" onClick={openAudit}>
              Audit Log
            </Button>
          )}
          <Button size="sm" onClick={() => setShowModal(true)}>
            + Add User
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
        <div className="max-w-full overflow-x-auto">
          <Table>
            <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
              <TableRow>
                <TableCell isHeader className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                  Email
                </TableCell>
                <TableCell isHeader className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                  Name
                </TableCell>
                <TableCell isHeader className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                  Role
                </TableCell>
                <TableCell isHeader className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                  Status
                </TableCell>
                <TableCell isHeader className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                  Created
                </TableCell>
                <TableCell isHeader className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                  Actions
                </TableCell>
              </TableRow>
            </TableHeader>

            <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
              {loading ? (
                <TableRow>
                  <td colSpan={6} className="px-5 py-8 text-center text-gray-500">
                    Loading users...
                  </td>
                </TableRow>
              ) : users.length === 0 ? (
                <TableRow>
                  <td colSpan={6} className="px-5 py-8 text-center text-gray-500">
                    No users found
                  </td>
                </TableRow>
              ) : (
                users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="px-5 py-4 sm:px-6 text-start">
                      <span className="font-medium text-gray-800 text-theme-sm dark:text-white/90">
                        {user.email}
                      </span>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-gray-500 text-start text-theme-sm dark:text-gray-400">
                      {user.name}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-start">
                      <Badge
                        size="sm"
                        variant="light"
                        color={ROLE_COLORS[user.role] || "info"}
                      >
                        {user.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-start">
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-medium ${
                          user.isActive
                            ? "text-success-500"
                            : "text-error-500"
                        }`}
                      >
                        <span
                          className={`inline-block w-2 h-2 rounded-full ${
                            user.isActive
                              ? "bg-success-500"
                              : "bg-error-500"
                          }`}
                        />
                        {user.isActive ? "Active" : "Inactive"}
                      </span>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-gray-500 text-theme-sm dark:text-gray-400">
                      {user.createdAt
                        ? new Date(user.createdAt).toLocaleDateString()
                        : "—"}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-start">
                      <div className="flex items-center gap-2">
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => openEdit(user)}
                        >
                          Edit
                        </Button>
                        {me?.id !== user.id && isSuperAdmin && (
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() =>
                              handleToggleActive(user.id, user.isActive)
                            }
                          >
                            {user.isActive ? "Deactivate" : "Activate"}
                          </Button>
                        )}
                        {me?.id !== user.id && isSuperAdmin && (
                          <button
                            onClick={() => handleDelete(user.id, user.email)}
                            className="inline-flex items-center justify-center gap-2 rounded-lg transition px-4 py-3 text-sm bg-error-500 text-white hover:bg-error-600"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Add User Modal */}
      <Modal isOpen={showModal} onClose={resetModal} className="max-w-md p-6">
        <div className="space-y-5">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            Add New User
          </h2>

          <div>
            <Label>Email</Label>
            <Input
              placeholder="user@example.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
            />
          </div>

          <div>
            <Label>Name</Label>
            <Input
              placeholder="Full name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </div>

          <div>
            <Label>Role</Label>
            <Select
              options={roleOptions}
              defaultValue="USER"
              onChange={setNewRole}
              placeholder="Select role"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" size="sm" onClick={resetModal}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleCreateUser}>
              Create User
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit User Modal */}
      {editData && (
        <Modal
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          className="max-w-md p-6"
        >
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
              Edit User
            </h2>

            <div>
              <Label>Email</Label>
              <p className="text-sm text-gray-500 mt-1">{editData.email}</p>
            </div>

            <div>
              <Label>Name</Label>
              <Input
                placeholder="Full name"
                value={editData.name}
                onChange={(e) =>
                  setEditData({ ...editData, name: e.target.value })
                }
              />
            </div>

            <div>
              <Label>Role</Label>
              <Select
                options={roleOptions}
                defaultValue={editData.role}
                onChange={(value) =>
                  setEditData({ ...editData, role: value })
                }
                placeholder="Select role"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowEditModal(false)}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={handleEditSave}>
                Save Changes
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Audit Log Modal */}
      <Modal
        isOpen={showAudit}
        onClose={() => setShowAudit(false)}
        className="max-w-3xl p-6"
      >
        <div className="space-y-5">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            Audit Log
          </h2>

          {auditLoading ? (
            <p className="text-gray-500">Loading audit logs...</p>
          ) : auditLogs.length === 0 ? (
            <p className="text-gray-500">No audit logs found</p>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-2 px-3 text-gray-500 font-medium">Action</th>
                    <th className="text-left py-2 px-3 text-gray-500 font-medium">Actor</th>
                    <th className="text-left py-2 px-3 text-gray-500 font-medium">Target</th>
                    <th className="text-left py-2 px-3 text-gray-500 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((log) => (
                    <tr
                      key={log.id}
                      className="border-b border-gray-100 dark:border-gray-800"
                    >
                      <td className="py-2 px-3 text-gray-800 dark:text-white/90">
                        {log.action}
                      </td>
                      <td className="py-2 px-3 text-gray-500">
                        {log.actor.email}
                        <span className="ml-1 text-xs opacity-60">
                          ({log.actor.role})
                        </span>
                      </td>
                      <td className="py-2 px-3 text-gray-500">
                        {log.target.email}
                        <span className="ml-1 text-xs opacity-60">
                          ({log.target.role})
                        </span>
                      </td>
                      <td className="py-2 px-3 text-gray-500">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
