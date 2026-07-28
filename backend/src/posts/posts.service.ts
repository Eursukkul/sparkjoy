import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PostsQueryDto } from './dto/posts-query.dto';

// `contains` becomes an ILIKE pattern, so `%` and `_` from user input would act
// as wildcards (`?search=_` matches every row). Backslash is Postgres' default
// LIKE escape character, so escaping here needs no ESCAPE clause.
const escapeLikePattern = (value: string): string => value.replace(/[\\%_]/g, '\\$&');

@Injectable()
export class PostsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll({ page, limit, tag, search }: PostsQueryDto) {
    const where: Prisma.PostWhereInput = {
      ...(tag ? { tags: { some: { tag: { name: tag } } } } : {}),
      ...(search ? { title: { contains: escapeLikePattern(search), mode: 'insensitive' } } : {}),
    };

    // Single transaction so items and total agree with each other.
    const [items, total] = await this.prisma.$transaction([
      this.prisma.post.findMany({
        where,
        orderBy: { postedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        // list view never needs the full HTML content — excerpt keeps payload small
        select: {
          id: true,
          title: true,
          excerpt: true,
          postedAt: true,
          postedBy: true,
          tags: { select: { tag: { select: { name: true } } } },
        },
      }),
      this.prisma.post.count({ where }),
    ]);

    return {
      items: items.map((post) => ({ ...post, tags: post.tags.map((t) => t.tag.name) })),
      meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  async findOne(id: string) {
    const post = await this.prisma.post.findUnique({
      where: { id },
      include: { tags: { select: { tag: { select: { name: true } } } } },
    });
    if (!post) throw new NotFoundException(`Post ${id} not found`);
    return { ...post, tags: post.tags.map((t) => t.tag.name) };
  }
}
