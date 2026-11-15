import React, { useEffect, useState } from "react";
import { useAuth } from "../../../lib/auth-context.js";
import { DataTable, type Column } from "../../../components/ui/DataTable.js";
import { Modal } from "../../../components/ui/Modal.js";
import { Input } from "../../../components/ui/Input.js";
import { Select } from "../../../components/ui/Select.js";
import { Badge } from "../../../components/ui/Badge.js";
import { Plus, Edit2, Building2 } from "lucide-react";

interface Department {
  id: string;
  name: string;
  description?: string | null;
  parent_department_id?: string | null;
  is_active: boolean;
  created_at: string;
}

export function DepartmentsView() {
  const { session, authContext } = useAuth();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [parentId, setParentId] = useState<string>("");

  const fetchDepartments = () => {
    if (!session?.access_token) return;
    setIsLoading(true);
    setErrorMsg(null);

    fetch("/api/v1/organization/departments", {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "X-Tenant-ID": authContext?.activeTenantId || "",
      },
    })
      .then((res) => res.json())
      .then((payload) => {
        if (payload.error) setErrorMsg(payload.error.message);
        else setDepartments(payload.data || []);
      })
      .catch((err) => setErrorMsg(err.message))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    fetchDepartments();
  }, [session, authContext?.activeTenantId]);

  const handleOpenCreate = () => {
    setEditingDept(null);
    setName("");
    setDescription("");
    setParentId("");
    setIsModalOpen(true);
  };

  const handleOpenEdit = (dept: Department) => {
    setEditingDept(dept);
    setName(dept.name);
    setDescription(dept.description || "");
    setParentId(dept.parent_department_id || "");
    setIsModalOpen(true);
  };

  const handleToggleActive = async (dept: Department) => {
    if (!session?.access_token) return;
    try {
      await fetch(`/api/v1/organization/departments/${dept.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          "X-Tenant-ID": authContext?.activeTenantId || "",
        },
        body: JSON.stringify({ isActive: !dept.is_active }),
      });
      fetchDepartments();
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.access_token) return;
    setIsSubmitting(true);
    setErrorMsg(null);

    const url = editingDept
      ? `/api/v1/organization/departments/${editingDept.id}`
      : "/api/v1/organization/departments";

    const method = editingDept ? "PATCH" : "POST";

    try {
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          "X-Tenant-ID": authContext?.activeTenantId || "",
        },
        body: JSON.stringify({
          name,
          description: description || null,
          parentDepartmentId: parentId || null,
        }),
      });

      const payload = await res.json();
      if (!res.ok || payload.error) {
        throw new Error(payload.error?.message || "Failed to save department");
      }

      setIsModalOpen(false);
      fetchDepartments();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const columns: Column<Department>[] = [
    {
      key: "name",
      header: "Department Name",
      render: (d) => (
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-neutral-400" />
          <span className="font-semibold text-neutral-900">{d.name}</span>
        </div>
      ),
    },
    {
      key: "description",
      header: "Description",
      render: (d) => (
        <span className="text-neutral-500 truncate max-w-xs block">
          {d.description || "—"}
        </span>
      ),
    },
    {
      key: "parent_department_id",
      header: "Parent Department",
      render: (d) => {
        if (!d.parent_department_id) return <span className="text-neutral-400">—</span>;
        const parent = departments.find((p) => p.id === d.parent_department_id);
        return <span>{parent?.name || "Parent Dept"}</span>;
      },
    },
    {
      key: "is_active",
      header: "Status",
      render: (d) => (
        <Badge variant={d.is_active ? "success" : "neutral"} dot>
          {d.is_active ? "Active" : "Archived"}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (d) => (
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => handleOpenEdit(d)}
            className="p-1 text-neutral-500 hover:text-blue-600 rounded"
            title="Edit Department"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => void handleToggleActive(d)}
            className={`text-xs px-2 py-0.5 rounded border ${
              d.is_active
                ? "border-neutral-200 text-neutral-600 hover:bg-neutral-100"
                : "border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
            }`}
          >
            {d.is_active ? "Archive" : "Activate"}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-neutral-900">Departments & Branches</h2>
          <p className="text-xs text-neutral-500">
            Structure your organization into functional units for dispatch and member scoping
          </p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-xs font-medium text-white hover:bg-blue-700 shadow-xs"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Department
        </button>
      </div>

      {errorMsg && (
        <div className="rounded-lg bg-red-50 p-3 text-xs text-red-700 border border-red-200">
          {errorMsg}
        </div>
      )}

      <DataTable
        columns={columns}
        data={departments}
        keyExtractor={(d) => d.id}
        isLoading={isLoading}
        emptyTitle="No departments found"
        emptyDescription="Create your first department to organize technicians and dispatchers."
        emptyAction={
          <button
            onClick={handleOpenCreate}
            className="text-xs font-medium text-blue-600 hover:text-blue-700"
          >
            + Create Department
          </button>
        }
      />

      {/* Create / Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingDept ? "Edit Department" : "New Department"}
        description="Provide a name and optional parent hierarchy"
        footer={
          <>
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-3 py-1.5 rounded-md text-xs font-medium text-neutral-600 hover:bg-neutral-100"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || !name.trim()}
              className="px-4 py-1.5 rounded-md text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isSubmitting ? "Saving..." : editingDept ? "Save Changes" : "Create"}
            </button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Department Name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Field Operations Riyadh"
          />

          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">
              Description (Optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-neutral-300 p-2.5 text-sm text-neutral-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
              placeholder="Responsibilities or regional coverage"
            />
          </div>

          <Select
            label="Parent Department (Optional)"
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
          >
            <option value="">None (Top-Level Department)</option>
            {departments
              .filter((d) => d.id !== editingDept?.id)
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
          </Select>
        </form>
      </Modal>
    </div>
  );
}
