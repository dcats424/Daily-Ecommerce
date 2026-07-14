import { ApiProperty } from '@nestjs/swagger';

class CustomerUser {
  @ApiProperty()
  id: string;

  @ApiProperty()
  phone: string;
}

export class VerifyOtpResponseDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty()
  isNew: boolean;

  @ApiProperty({ type: CustomerUser })
  user: CustomerUser;
}
