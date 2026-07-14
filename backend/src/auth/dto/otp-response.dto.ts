import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OtpResponseDto {
  @ApiProperty()
  message: string;

  @ApiPropertyOptional()
  debugCode?: string;
}
