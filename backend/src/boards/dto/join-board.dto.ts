import { IsString, Matches } from 'class-validator';
import { Trim } from '../../common/validation';

export class JoinBoardDto {
  // Any letter case is fine: codes are read aloud and typed by hand.
  @Trim()
  @IsString()
  @Matches(/^CHK-[A-Z0-9]{4}$/i, { message: 'Код выглядит так: CHK-AB12' })
  code!: string;
}
