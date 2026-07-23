import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class PostsQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page = 1;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit = 20;

  @ApiPropertyOptional({ description: 'Filter by exact tag name' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  tag?: string;

  @ApiPropertyOptional({ description: 'Case-insensitive title search' })
  @IsString()
  @MaxLength(200)
  @IsOptional()
  search?: string;
}
