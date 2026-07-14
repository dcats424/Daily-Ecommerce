import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiCreatedResponse, ApiTags } from '@nestjs/swagger';
import { StaffService } from './staff.service';
import { RBAC } from '../auth/decorators/roles.decorator';
import { CreateStaffDto } from '../auth/dto/create-staff.dto';
import { StaffResponseDto } from './dto/staff-response.dto';

@ApiTags('Staff')
@ApiBearerAuth()
@Controller('staff')
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get()
  @RBAC('staff', 'read')
  @ApiOkResponse({ type: [StaffResponseDto] })
  async list() {
    return this.staff.findAll();
  }

  @Post()
  @RBAC('staff', 'write')
  @ApiCreatedResponse({ type: StaffResponseDto })
  async create(@Body() body: CreateStaffDto) {
    return this.staff.create(body);
  }
}
