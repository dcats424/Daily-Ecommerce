import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RBAC_KEY, RbacOptions } from '../decorators/roles.decorator';
import { RbacService } from '../../rbac/rbac.service';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbac: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const rbacOptions = this.reflector.getAllAndOverride<RbacOptions>(RBAC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!rbacOptions) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user || user.type !== 'staff') {
      return false;
    }

    return this.rbac.checkPermission(user.roleId, rbacOptions.resource, rbacOptions.action);
  }
}
