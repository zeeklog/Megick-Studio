import { Body, Controller, Delete, Get, Param, Post, Query } from "@nestjs/common";
import { NavigationMenuArea } from "@prisma/client";
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
import { Public } from "@/common/decorators/public.decorator";
import { Roles } from "@/common/decorators/roles.decorator";
import {
  ApiOkArrayResponse,
  ApiOkResponseModel,
  ApiSessionCookieAuth,
  ApiValidationErrorResponse,
  documentedOperation,
} from "@/common/swagger/api-docs";
import { NavigationMenuItemDto } from "./navigation-menus.dto";
import { NavigationMenusService } from "./navigation-menus.service";

@ApiTags("navigation-menus")
@Controller("api/navigation-menus")
export class NavigationMenusController {
  constructor(private readonly menus: NavigationMenusService) {}

  @Public()
  @Get()
  @ApiQuery({ name: "area", enum: NavigationMenuArea })
  @ApiOperation(
    documentedOperation(
      "List active navigation menu items",
      "Returns active menu items for a public UI area. No authentication required.",
    ),
  )
  @ApiOkArrayResponse(NavigationMenuItemDto, "Navigation menu items loaded.")
  listPublic(@Query("area") area: NavigationMenuArea) {
    return this.menus.listPublic(area);
  }
}

@ApiTags("admin/navigation-menus")
@ApiSessionCookieAuth("Requires a valid `mg_session` cookie for a SUPER_ADMIN account.")
@ApiValidationErrorResponse()
@Roles("SUPER_ADMIN")
@Controller("api/admin/navigation-menus")
export class AdminNavigationMenusController {
  constructor(private readonly menus: NavigationMenusService) {}

  @Get()
  @ApiOperation(
    documentedOperation(
      "List navigation menu items for admin",
      "Returns all menu items across all UI areas, including inactive rows.",
    ),
  )
  @ApiOkArrayResponse(NavigationMenuItemDto, "Admin navigation menu items loaded.")
  listAdmin() {
    return this.menus.listAdmin();
  }

  @Post()
  @ApiOperation(
    documentedOperation(
      "Create or update a navigation menu item",
      "Creates a new menu item or updates an existing row when `id` is present.",
    ),
  )
  @ApiOkResponseModel(NavigationMenuItemDto, "Navigation menu item saved.")
  upsert(@Body() dto: NavigationMenuItemDto) {
    return this.menus.upsert(dto);
  }

  @Delete(":id")
  @ApiParam({ name: "id" })
  @ApiOperation(documentedOperation("Delete a navigation menu item", "Deletes the row by id."))
  @ApiOkResponseModel(NavigationMenuItemDto, "Navigation menu item deleted.")
  remove(@Param("id") id: string) {
    return this.menus.delete(id);
  }
}
