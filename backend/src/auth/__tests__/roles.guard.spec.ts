import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../guards/roles.guard';
import { RbacService } from '../../rbac/rbac.service';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: any;
  let rbac: any;

  const mockContext = (user: any, _rbacOptions: any) => ({
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  });

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    };
    rbac = {
      checkPermission: jest.fn(),
    };
    guard = new RolesGuard(reflector as any, rbac as any);
  });

  it('should allow access when no RBAC options are set', async () => {
    reflector.getAllAndOverride.mockReturnValue(null);
    const result = await guard.canActivate(mockContext({ type: 'staff' }, null) as any);
    expect(result).toBe(true);
  });

  it('should deny access when user is not staff', async () => {
    reflector.getAllAndOverride.mockReturnValue({ resource: 'orders', action: 'read' });
    const result = await guard.canActivate(mockContext({ type: 'customer' }, {}) as any);
    expect(result).toBe(false);
  });

  it('should check permission via RbacService', async () => {
    reflector.getAllAndOverride.mockReturnValue({ resource: 'orders', action: 'read' });
    rbac.checkPermission.mockResolvedValue(true);

    const result = await guard.canActivate(
      mockContext({ type: 'staff', roleId: 'role-1' }, {}) as any,
    );

    expect(result).toBe(true);
    expect(rbac.checkPermission).toHaveBeenCalledWith('role-1', 'orders', 'read');
  });

  it('should deny when RbacService returns false', async () => {
    reflector.getAllAndOverride.mockReturnValue({ resource: 'orders', action: 'delete' });
    rbac.checkPermission.mockResolvedValue(false);

    const result = await guard.canActivate(
      mockContext({ type: 'staff', roleId: 'role-1' }, {}) as any,
    );

    expect(result).toBe(false);
  });
});
