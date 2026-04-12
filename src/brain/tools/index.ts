import { execute_instagram_dm } from './instagram_dm';
import { execute_platform_post } from './platform_post';
import { execute_caption_manager } from './caption_manager';
import { execute_instagram_fetch } from './instagram_fetch';

export async function runTool(tool: string, args: any) {
  switch (tool) {
    case 'instagram_dm':
      return await execute_instagram_dm(args);
    case 'instagram_fetch':
      return await execute_instagram_fetch();
    case 'platform_post':
      return await execute_platform_post(args);
    case 'caption_manager':
      return await execute_caption_manager(args);
    default:
      throw new Error(`Unknown tool: ${tool}`);
  }
}
