import { User } from '../../users/entities/user.entity';

export class AuthResponseDto {
  accessToken: string;
  refreshToken: string;
  user: Partial<User>;
}
