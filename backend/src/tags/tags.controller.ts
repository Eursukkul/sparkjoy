import { Controller, Get } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('tags')
@ApiCookieAuth('access_token')
@Controller('tags')
export class TagsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'All tags with post counts (drives the filter UI)' })
  async findAll() {
    const tags = await this.prisma.tag.findMany({
      orderBy: { name: 'asc' },
      select: { name: true, _count: { select: { posts: true } } },
    });
    return tags.map((tag) => ({ name: tag.name, postCount: tag._count.posts }));
  }
}
