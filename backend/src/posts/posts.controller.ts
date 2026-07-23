import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PostsQueryDto } from './dto/posts-query.dto';
import { PostsService } from './posts.service';

@ApiTags('posts')
@ApiCookieAuth('access_token')
@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Get()
  @ApiOperation({ summary: 'Paginated post list with optional tag filter and title search' })
  findAll(@Query() query: PostsQueryDto) {
    return this.postsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Full post detail including sanitized HTML content' })
  findOne(@Param('id') id: string) {
    return this.postsService.findOne(id);
  }
}
