import { IsString, IsUUID, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AssignPermissionDto {
  @ApiProperty()
  @IsUUID()
  roleId: string;

  @ApiProperty()
  @IsUUID()
  resourceId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  canRead?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  canWrite?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  canDelete?: boolean;
}
