import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiCreatedResponse, ApiTags } from '@nestjs/swagger';
import { RbacService } from './rbac.service';
import { RBAC } from '../auth/decorators/roles.decorator';
import { CreateRoleDto } from './dto/create-role.dto';
import { AssignPermissionDto } from './dto/assign-permission.dto';
import { RoleResponseDto } from './dto/role-response.dto';
import { ResourceResponseDto } from './dto/resource-response.dto';

@ApiTags('RBAC')
@ApiBearerAuth()
@Controller('rbac')
export class RbacController {
  constructor(private readonly rbac: RbacService) {}

  @Get('roles')
  @RBAC('roles', 'read')
  @ApiOkResponse({ type: [RoleResponseDto] })
  async getRoles() {
    return this.rbac.getRoles();
  }

  @Get('resources')
  @RBAC('roles', 'read')
  @ApiOkResponse({ type: [ResourceResponseDto] })
  async getResources() {
    return this.rbac.getResources();
  }

  @Post('roles')
  @RBAC('roles', 'write')
  @ApiCreatedResponse({ type: RoleResponseDto })
  async createRole(@Body() body: CreateRoleDto) {
    return this.rbac.createRole(body.name, body.description);
  }

  @Post('permissions')
  @RBAC('roles', 'write')
  @ApiCreatedResponse({ type: RoleResponseDto })
  async assignPermission(@Body() body: AssignPermissionDto) {
    return this.rbac.assignPermission(body.roleId, body.resourceId, {
      canRead: body.canRead,
      canWrite: body.canWrite,
      canDelete: body.canDelete,
    });
  }
}
