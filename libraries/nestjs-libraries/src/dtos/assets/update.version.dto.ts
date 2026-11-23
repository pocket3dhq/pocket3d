import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { NOTE_MAX_LENGTH } from '@pocket3d/helpers/utils/versions';
import { CleanNote } from './version.transforms';

// PUT /assets/:id/versions/:n: the note is the only thing a version lets you
// change ("" clears it)
export class UpdateVersionDto {
  @ApiProperty({ maxLength: NOTE_MAX_LENGTH, description: 'Up to 280 characters; "" clears it' })
  @CleanNote()
  @IsString()
  note: string;
}
