import { InstanceDto } from '@api/dto/instance.dto';
import { NewsletterFollowDto } from '@api/dto/newsletter.dto';
import { WAMonitoringService } from '@api/services/monitor.service';
import { BadRequestException } from '@exceptions';

export class NewsletterController {
  constructor(private readonly waMonitor: WAMonitoringService) {}

  public async fetchAllNewsletters(instance: InstanceDto) {
    return await this.instanceOrFail(instance).fetchAllNewsletters();
  }

  public async followNewsletter(instance: InstanceDto, data: NewsletterFollowDto) {
    return await this.instanceOrFail(instance).followNewsletter(data);
  }

  // Los canales de WhatsApp solo existen sobre Baileys; con Cloud API o el canal
  // Evolution estos métodos no están definidos y llamarlos daría un 500 opaco.
  private instanceOrFail(instance: InstanceDto) {
    const waInstance = this.waMonitor.waInstances[instance.instanceName];

    if (!waInstance) {
      throw new BadRequestException(`Instance "${instance.instanceName}" not found`);
    }

    if (typeof waInstance.fetchAllNewsletters !== 'function') {
      throw new BadRequestException('WhatsApp channels are only supported on Baileys instances');
    }

    return waInstance;
  }
}
