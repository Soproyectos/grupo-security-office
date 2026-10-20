import { Transform } from 'class-transformer';
import { IsIn, IsISO8601, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
export class ActivityDto {
 @Transform(({value}) => typeof value === 'string' ? value.trim() : value)
 @IsString() @IsNotEmpty() @MaxLength(500) title: string;
 @IsIn(['CALL','VISIT','FOLLOW_UP']) kind: string;
 @IsUUID() assigneeId: string;
 @IsISO8601({strict:true}) @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/) startsAt: string;
}
export class AssignDto {
 @IsUUID() assigneeId: string;
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
/** Tipos de recurso enlazable (DISENO-CATALOGO:88). `LISTA` es la lista del
 *  catálogo (modelo `Lista`, la única pertenencia de un producto) y
 *  `PRICE_LIST` la lista de tarifas (`PriceList`). `PRICE_REVISION` no existe:
 *  el schema no modela revisiones. */
export const LINK_TARGETS = ['PRODUCT','LISTA','PRICE_LIST','IMPORT_SESSION'] as const;
export type LinkTarget = (typeof LINK_TARGETS)[number];
export class LinkDto {
 @IsIn([...LINK_TARGETS]) targetType: LinkTarget;
 @IsUUID() targetId: string;
}
/** Conversión EXPLÍCITA de solicitud/incidencia en tarea (BASE-03 D6).
 *  `ruleKey`/`revisionKey` completan la clave de deduplicación
 *  `producto+regla+revisión` del diseño (DISENO-CATALOGO:90); ambos son
 *  opcionales y se normalizan a cadena vacía. `assigneeId` opcional: si falta,
 *  la tarea queda asignada al ACTOR de la conversión. */
export class ConvertDto {
 @IsUUID() productId: string;
 @IsOptional() @Transform(({value}) => typeof value === 'string' ? value.trim() : value)
 @IsString() @MaxLength(200) ruleKey?: string;
 @IsOptional() @Transform(({value}) => typeof value === 'string' ? value.trim() : value)
 @IsString() @MaxLength(200) revisionKey?: string;
 @IsOptional() @IsUUID() assigneeId?: string;
 @IsOptional() @Transform(({value}) => typeof value === 'string' ? value.trim() : value)
 @IsString() @IsNotEmpty() @MaxLength(500) title?: string;
 @IsOptional() @IsISO8601({strict:true}) @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/) startsAt?: string;
}
