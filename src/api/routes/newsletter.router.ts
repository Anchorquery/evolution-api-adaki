import { RouterBroker } from '@api/abstract/abstract.router';
import { NewsletterFindDto, NewsletterFollowDto } from '@api/dto/newsletter.dto';
import { newsletterController } from '@api/server.module';
import { newsletterFollowSchema } from '@validate/validate.schema';
import { RequestHandler, Router } from 'express';

import { HttpStatus } from './index.router';

export class NewsletterRouter extends RouterBroker {
  constructor(...guards: RequestHandler[]) {
    super();
    this.router
      .get(this.routerPath('find'), ...guards, async (req, res) => {
        const response = await this.dataValidate<NewsletterFindDto>({
          request: req,
          schema: {},
          ClassRef: NewsletterFindDto,
          execute: (instance) => newsletterController.fetchAllNewsletters(instance),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .post(this.routerPath('follow'), ...guards, async (req, res) => {
        const response = await this.dataValidate<NewsletterFollowDto>({
          request: req,
          schema: newsletterFollowSchema,
          ClassRef: NewsletterFollowDto,
          execute: (instance, data) => newsletterController.followNewsletter(instance, data),
        });

        res.status(HttpStatus.CREATED).json(response);
      });
  }

  public readonly router: Router = Router();
}
