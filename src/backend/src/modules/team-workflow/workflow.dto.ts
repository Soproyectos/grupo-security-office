import { Transform } from 'class-transformer';
import { IsIn, IsISO8601, IsNotEmpty, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
export class ActivityDto {
 @Transform(({value}) => typeof value === 'string' ? value.trim() : value)
 @IsString() @IsNotEmpty() @MaxLength(500) title: string;
 @IsIn(['CALL','VISIT','FOLLOW_UP']) kind: string;
 @IsUUID() assigneeId: string;
 @IsISO8601({strict:true}) @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/) startsAt: string;
}
export class RequestDto {
 @IsIn(['INCORPORATION','ACCOUNT','REASSIGNMENT']) kind: string;
 @Transform(({value}) => typeof value === 'string' ? value.trim() : value)
 @IsString() @IsNotEmpty() @MaxLength(2000) detail: string;
}
export class ReviewDto {
 @IsIn(['APPROVED','REJECTED']) status: string;
 @Transform(({value}) => typeof value === 'string' ? value.trim() : value)
 @IsString() @IsNotEmpty() @MaxLength(2000) response: string;
}
