import { Icons } from "@/components/icons"

export interface NavItem {
  title: string;
  href?: string;
  disabled?: boolean;
  external?: boolean;
  icon?: keyof typeof Icons;
  label?: string;
  description?: string;
  active?: boolean;
}

export interface NavItemWithChildren extends NavItem {
  items: NavItemWithChildren[];
  expanded?: boolean;
}

export interface MainNavItem extends NavItem {
  /**
   * Whether the item should be shown in the main navigation.
   * @default true
   */
  showInNav?: boolean;
}

export interface SidebarNavItem extends NavItemWithChildren {
  /**
   * Whether the item should be shown in the sidebar.
   * @default true
   */
  showInSidebar?: boolean;
  /**
   * The minimum user role required to see this item.
   */
  requiredRole?: string;
}