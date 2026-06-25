import { Module } from "@nestjs/common";
import {
  AdminNavigationMenusController,
  NavigationMenusController,
} from "./navigation-menus.controller";
import { NavigationMenusService } from "./navigation-menus.service";

@Module({
  controllers: [NavigationMenusController, AdminNavigationMenusController],
  providers: [NavigationMenusService],
  exports: [NavigationMenusService],
})
export class NavigationMenusModule {}
