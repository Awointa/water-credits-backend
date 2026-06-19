import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-strategy';
import { Request } from 'express';
import { AuthService } from '../auth.service';
import { User } from '../../users/entities/user.entity';

@Injectable()
export class StellarWalletStrategy extends PassportStrategy(Strategy, 'stellar-wallet') {
  constructor(private readonly authService: AuthService) {
    super();
  }

  authenticate(req: Request, _options?: any): void {
    const { wallet, signature, challenge } = req.body || {};

    if (!wallet || !signature || !challenge) {
      return this.fail({ message: 'Missing wallet, signature, or challenge' }, 401);
    }

    this.authService
      .validateStellarSignature(wallet, signature, challenge)
      .then((user: User | null) => {
        if (!user) {
          return this.fail({ message: 'Invalid Stellar signature' }, 401);
        }
        this.success(user);
      })
      .catch((err) => this.error(err));
  }
}
