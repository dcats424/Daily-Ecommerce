import { ApiProperty } from '@nestjs/swagger';

class ResourceInfo {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  description: string;
}

class PermissionInfo {
  @ApiProperty()
  id: string;

  @ApiProperty()
  roleId: string;

  @ApiProperty()
  resourceId: string;

  @ApiProperty()
  canRead: boolean;

  @ApiProperty()
  canWrite: boolean;

  @ApiProperty()
  canDelete: boolean;

  @ApiProperty({ type: ResourceInfo })
  resource: ResourceInfo;
}

export class RoleResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  description: string;

  @ApiProperty()
  isSystem: boolean;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  updatedAt: string;

  @ApiProperty({ type: [PermissionInfo] })
  permissions: PermissionInfo[];
}
