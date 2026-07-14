import { SetMetadata } from '@nestjs/common';

export const RBAC_KEY = 'rbac';
export interface RbacOptions {
  resource: string;
  action: 'read' | 'write' | 'delete';
}
export const RBAC = (resource: string, action: 'read' | 'write' | 'delete') =>
  SetMetadata(RBAC_KEY, { resource, action } as RbacOptions);
