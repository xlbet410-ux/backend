import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Same 'jwt' strategy as JwtAuthGuard, but never rejects the request — a
// missing/invalid/expired token just leaves req.user unset instead of
// throwing 401. For routes that are public but want to personalize their
// response when the caller happens to be logged in (e.g. the homepage
// Featured section prioritizing games this player has actually played).
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = unknown>(err: unknown, user: TUser): TUser {
    return user;
  }
}
