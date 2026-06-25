import { Injectable } from "@nestjs/common";
import { PrismaService } from "nestjs-prisma";

@Injectable()
export class RbacService {
  constructor(private readonly prisma: PrismaService) {}

  listRoles() {
    return this.prisma.role.findMany({
      orderBy: { code: "asc" },
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { users: true } },
      },
    });
  }

  listPermissions() {
    return this.prisma.permission.findMany({ orderBy: [{ group: "asc" }, { code: "asc" }] });
  }

  async createRole(input: { code: string; name: string; description?: string; permissionCodes: string[] }) {
    const role = await this.prisma.role.create({
      data: {
        code: input.code,
        name: input.name,
        description: input.description,
      },
    });
    if (input.permissionCodes.length) {
      await this.replacePermissions(role.id, input.permissionCodes);
    }
    return role;
  }

  async updateRole(id: string, input: { name?: string; description?: string; permissionCodes?: string[] }) {
    const role = await this.prisma.role.update({
      where: { id },
      data: { name: input.name, description: input.description },
    });
    if (input.permissionCodes) {
      await this.replacePermissions(id, input.permissionCodes);
    }
    return role;
  }

  async deleteRole(id: string) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role || role.isSystem) {
      throw new Error("Cannot delete system role");
    }
    return this.prisma.role.delete({ where: { id } });
  }

  private async replacePermissions(roleId: string, codes: string[]) {
    const perms = await this.prisma.permission.findMany({ where: { code: { in: codes } } });
    await this.prisma.rolePermission.deleteMany({ where: { roleId } });
    if (perms.length) {
      await this.prisma.rolePermission.createMany({
        data: perms.map((p) => ({ roleId, permissionId: p.id })),
      });
    }
  }

  async assignRoleToUser(userId: string, roleCode: string) {
    const role = await this.prisma.role.findUnique({ where: { code: roleCode } });
    if (!role) throw new Error("Role not found");
    return this.prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId: role.id } },
      update: {},
      create: { userId, roleId: role.id },
    });
  }

  async removeRoleFromUser(userId: string, roleCode: string) {
    const role = await this.prisma.role.findUnique({ where: { code: roleCode } });
    if (!role) return;
    await this.prisma.userRole.deleteMany({ where: { userId, roleId: role.id } });
  }
}
