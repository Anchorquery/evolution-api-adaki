import { NewsletterFollowDto } from '@api/dto/newsletter.dto';
import { InstanceDto } from '@api/dto/instance.dto';
import { WAMonitoringService } from '@api/services/monitor.service';

export class NewsletterController {
  constructor(private readonly waMonitor: WAMonitoringService) {}

  public async fetchAllNewsletters(instance: InstanceDto) {
    return await this.waMonitor.waInstances[instance.instanceName].fetchAllNewsletters();
  }

  public async followNewsletter(instance: InstanceDto, data: NewsletterFollowDto) {
    return await this.waMonitor.waInstances[instance.instanceName].followNewsletter(data);
  }
}
