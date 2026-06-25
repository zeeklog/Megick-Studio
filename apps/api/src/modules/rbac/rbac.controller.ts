import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { Roles } from "@/common/decorators/roles.decorator";
import { RbacService } from "./rbac.service";
import { CreateRoleDto, UpdateRoleDto } from "./rbac.dto";
import {
  ApiOkArrayResponse,
  ApiOkResponseModel,
  ApiSessionCookieAuth,
  PermissionDto,
  RoleWithPermissionsDto,
  documentedOperation,
} from "@/common/swagger/api-docs";

@ApiTags("admin/rbac")
@ApiSessionCookieAuth(
  "Requires a valid `mg_session` cookie for a SUPER_ADMIN account.",
)
@Roles("SUPER_ADMIN")
@Controller("api/admin/rbac")
export class RbacController {
  constructor(private readonly rbac: RbacService) {}

  @Get("permissions")
  @ApiOperation(
    documentedOperation(
      "List all permissions",
      "Returns the complete permission catalog sorted by group and code.",
    ),
  )
  @ApiOkArrayResponse(
    PermissionDto,
    "Permission catalog loaded successfully.",
  )
  permissions() {
    return this.rbac.listPermissions();
  }

  @Get("roles")
  @ApiOperation(
    documentedOperation(
      "List roles + their permissions",
      "Returns every role with nested permissions and user assignment counts.",
    ),
  )
  @ApiOkArrayResponse(
    RoleWithPermissionsDto,
    "Roles loaded successfully.",
  )
  roles() {
    return this.rbac.listRoles();
  }

  @Post("roles")
  @ApiOperation(
    documentedOperation(
      "Create role",
      "Creates a new role and optionally links it to the provided permission codes.",
    ),
  )
  @ApiOkResponseModel(
    RoleWithPermissionsDto,
    "Role created successfully.",
  )
  create(@Body() dto: CreateRoleDto) {
    return this.rbac
      .createRole({ ...dto, permissionCodes: dto.permissionCodes ?? [] })
      .then(() => this.rbac.listRoles())
      .then((roles) => roles.find((role) => role.code === dto.code));
  }

  @Patch("roles/:id")
  @ApiParam({
    name: "id",
    description: "Role ID.",
    example: "cmrole123",
  })
  @ApiOperation(
    documentedOperation(
      "Update role",
      "Updates a role and optionally replaces its permission assignments when `permissionCodes` is provided.",
    ),
  )
  @ApiOkResponseModel(
    RoleWithPermissionsDto,
    "Role updated successfully.",
  )
  update(@Param("id") id: string, @Body() dto: UpdateRoleDto) {
    return this.rbac
      .updateRole(id, dto)
      .then((role) => this.rbac.listRoles().then((roles) => roles.find((item) => item.id === role.id)));
  }

  @Delete("roles/:id")
  @ApiParam({
    name: "id",
    description: "Role ID.",
    example: "cmrole123",
  })
  @ApiOperation(
    documentedOperation(
      "Delete role",
      "Deletes a non-system role. Built-in system roles cannot be removed.",
    ),
  )
  @ApiOkResponseModel(
    RoleWithPermissionsDto,
    "Role deleted successfully.",
  )
  remove(@Param("id") id: string) {
    return this.rbac
      .listRoles()
      .then((roles) => {
        const snapshot = roles.find((role) => role.id === id);
        return this.rbac.deleteRole(id).then(() => snapshot);
      });
  }
}
