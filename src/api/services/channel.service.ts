import { InstanceDto } from '@api/dto/instance.dto';
import { ProxyDto } from '@api/dto/proxy.dto';
import { SettingsDto } from '@api/dto/settings.dto';
import { ChatwootDto } from '@api/integrations/chatbot/chatwoot/dto/chatwoot.dto';
import { ChatwootService } from '@api/integrations/chatbot/chatwoot/services/chatwoot.service';
import { DifyService } from '@api/integrations/chatbot/dify/services/dify.service';
import { OpenaiService } from '@api/integrations/chatbot/openai/services/openai.service';
import { TypebotService } from '@api/integrations/chatbot/typebot/services/typebot.service';
import { PrismaRepository, Query } from '@api/repository/repository.service';
import { eventManager, waMonitor } from '@api/server.module';
import { Events, wa } from '@api/types/wa.types';
import { Auth, Chatwoot, ConfigService, HttpServer, Proxy } from '@config/env.config';
import { Logger } from '@config/logger.config';
import { NotFoundException } from '@exceptions';
import { Contact, Message, Prisma } from '@prisma/client';
import { createJid } from '@utils/createJid';
import { WASocket } from 'baileys';
import { isArray } from 'class-validator';
import EventEmitter2 from 'eventemitter2';
import { v4 } from 'uuid';

import { CacheService } from './cache.service';

export class ChannelStartupService {
  constructor(
    public readonly configService: ConfigService,
    public readonly eventEmitter: EventEmitter2,
    public readonly prismaRepository: PrismaRepository,
    public readonly chatwootCache: CacheService,
  ) {}

  public readonly logger = new Logger('ChannelStartupService');

  public client: WASocket;
  public readonly instance: wa.Instance = {};
  public readonly localChatwoot: wa.LocalChatwoot = {};
  public readonly localProxy: wa.LocalProxy = {};
  // newsletterIgnore arranca en true a propósito: loadSettings() es asíncrono y
  // shouldIgnoreJid puede consultarse antes de que resuelva. Sin este default,
  // durante esa ventana (justo cuando llega el history sync) los canales se
  // colarían aunque la instancia los tenga desactivados.
  public readonly localSettings: wa.LocalSettings = { newsletterIgnore: true };
  public readonly localWebhook: wa.LocalWebHook = {};

  public chatwootService = new ChatwootService(
    waMonitor,
    this.configService,
    this.prismaRepository,
    this.chatwootCache,
  );

  public openaiService = new OpenaiService(waMonitor, this.prismaRepository, this.configService);

  public typebotService = new TypebotService(waMonitor, this.configService, this.prismaRepository, this.openaiService);

  public difyService = new DifyService(waMonitor, this.prismaRepository, this.configService, this.openaiService);

  public setInstance(instance: InstanceDto) {
    this.logger.setInstance(instance.instanceName);

    this.instance.name = instance.instanceName;
    this.instance.id = instance.instanceId;
    this.instance.integration = instance.integration;
    this.instance.number = instance.number;
    this.instance.token = instance.token;
    this.instance.businessId = instance.businessId;
    this.instance.ownerJid = instance.ownerJid;

    if (this.configService.get<Chatwoot>('CHATWOOT').ENABLED && this.localChatwoot?.enabled) {
      this.chatwootService.eventWhatsapp(
        Events.STATUS_INSTANCE,
        { instanceName: this.instance.name },
        {
          instance: this.instance.name,
          status: 'created',
        },
      );
    }
  }

  public set instanceName(name: string) {
    this.logger.setInstance(name);

    if (!name) {
      this.instance.name = v4();
      return;
    }
    this.instance.name = name;
  }

  public get instanceName() {
    return this.instance.name;
  }

  public set instanceId(id: string) {
    if (!id) {
      this.instance.id = v4();
      return;
    }
    this.instance.id = id;
  }

  public get instanceId() {
    return this.instance.id;
  }

  public set integration(integration: string) {
    this.instance.integration = integration;
  }

  public get integration() {
    return this.instance.integration;
  }

  public set number(number: string) {
    this.instance.number = number;
  }

  public get number() {
    return this.instance.number;
  }

  public set token(token: string) {
    this.instance.token = token;
  }

  public get token() {
    return this.instance.token;
  }

  public get wuid() {
    return this.instance.wuid;
  }

  public async loadWebhook() {
    const data = await this.prismaRepository.webhook.findUnique({
      where: {
        instanceId: this.instanceId,
      },
    });

    this.localWebhook.enabled = data?.enabled;
    this.localWebhook.webhookBase64 = data?.webhookBase64;
  }

  public async loadSettings() {
    const data = await this.prismaRepository.setting.findUnique({
      where: {
        instanceId: this.instanceId,
      },
    });

    this.localSettings.rejectCall = data?.rejectCall;
    this.localSettings.msgCall = data?.msgCall;
    this.localSettings.groupsIgnore = data?.groupsIgnore;
    this.localSettings.alwaysOnline = data?.alwaysOnline;
    this.localSettings.readMessages = data?.readMessages;
    this.localSettings.readStatus = data?.readStatus;
    this.localSettings.syncFullHistory = data?.syncFullHistory;
    // Sin fila de settings, los canales se ignoran (comportamiento histórico).
    this.localSettings.newsletterIgnore = data?.newsletterIgnore ?? true;
    this.localSettings.wavoipToken = data?.wavoipToken;
  }

  public async setSettings(data: SettingsDto) {
    await this.prismaRepository.setting.upsert({
      where: {
        instanceId: this.instanceId,
      },
      update: {
        rejectCall: data.rejectCall,
        msgCall: data.msgCall,
        groupsIgnore: data.groupsIgnore,
        alwaysOnline: data.alwaysOnline,
        readMessages: data.readMessages,
        readStatus: data.readStatus,
        syncFullHistory: data.syncFullHistory,
        newsletterIgnore: data.newsletterIgnore ?? this.localSettings.newsletterIgnore ?? true,
        wavoipToken: data.wavoipToken,
      },
      create: {
        rejectCall: data.rejectCall,
        msgCall: data.msgCall,
        groupsIgnore: data.groupsIgnore,
        alwaysOnline: data.alwaysOnline,
        readMessages: data.readMessages,
        readStatus: data.readStatus,
        syncFullHistory: data.syncFullHistory,
        newsletterIgnore: data.newsletterIgnore ?? this.localSettings.newsletterIgnore ?? true,
        wavoipToken: data.wavoipToken,
        instanceId: this.instanceId,
      },
    });

    this.localSettings.rejectCall = data?.rejectCall;
    this.localSettings.msgCall = data?.msgCall;
    this.localSettings.groupsIgnore = data?.groupsIgnore;
    this.localSettings.alwaysOnline = data?.alwaysOnline;
    this.localSettings.readMessages = data?.readMessages;
    this.localSettings.readStatus = data?.readStatus;
    this.localSettings.syncFullHistory = data?.syncFullHistory;
    this.localSettings.newsletterIgnore = data?.newsletterIgnore ?? this.localSettings.newsletterIgnore ?? true;
    this.localSettings.wavoipToken = data?.wavoipToken;

    if (this.localSettings.wavoipToken && this.localSettings.wavoipToken.length > 0) {
      this.client.ws.close();
      this.client.ws.connect();
    }
  }

  public async findSettings() {
    const data = await this.prismaRepository.setting.findUnique({
      where: {
        instanceId: this.instanceId,
      },
    });

    if (!data) {
      return null;
    }

    return {
      rejectCall: data.rejectCall,
      msgCall: data.msgCall,
      groupsIgnore: data.groupsIgnore,
      alwaysOnline: data.alwaysOnline,
      readMessages: data.readMessages,
      readStatus: data.readStatus,
      syncFullHistory: data.syncFullHistory,
      newsletterIgnore: data.newsletterIgnore,
      wavoipToken: data.wavoipToken,
    };
  }

  public async loadChatwoot() {
    if (!this.configService.get<Chatwoot>('CHATWOOT').ENABLED) {
      return;
    }

    const data = await this.prismaRepository.chatwoot.findUnique({
      where: {
        instanceId: this.instanceId,
      },
    });

    this.localChatwoot.enabled = data?.enabled;
    this.localChatwoot.accountId = data?.accountId;
    this.localChatwoot.token = data?.token;
    this.localChatwoot.url = data?.url;
    this.localChatwoot.nameInbox = data?.nameInbox;
    this.localChatwoot.signMsg = data?.signMsg;
    this.localChatwoot.signDelimiter = data?.signDelimiter;
    this.localChatwoot.number = data?.number;
    this.localChatwoot.reopenConversation = data?.reopenConversation;
    this.localChatwoot.conversationPending = data?.conversationPending;
    this.localChatwoot.mergeBrazilContacts = data?.mergeBrazilContacts;
    this.localChatwoot.importContacts = data?.importContacts;
    this.localChatwoot.importMessages = data?.importMessages;
    this.localChatwoot.daysLimitImportMessages = data?.daysLimitImportMessages;
  }

  public async setChatwoot(data: ChatwootDto) {
    if (!this.configService.get<Chatwoot>('CHATWOOT').ENABLED) {
      return;
    }

    const chatwoot = await this.prismaRepository.chatwoot.findUnique({
      where: {
        instanceId: this.instanceId,
      },
    });

    if (chatwoot) {
      await this.prismaRepository.chatwoot.update({
        where: {
          instanceId: this.instanceId,
        },
        data: {
          enabled: data?.enabled,
          accountId: data.accountId,
          token: data.token,
          url: data.url,
          nameInbox: data.nameInbox,
          signMsg: data.signMsg,
          signDelimiter: data.signMsg ? data.signDelimiter : null,
          number: data.number,
          reopenConversation: data.reopenConversation,
          conversationPending: data.conversationPending,
          mergeBrazilContacts: data.mergeBrazilContacts,
          importContacts: data.importContacts,
          importMessages: data.importMessages,
          daysLimitImportMessages: data.daysLimitImportMessages,
          organization: data.organization,
          logo: data.logo,
          ignoreJids: data.ignoreJids,
          allowedJids: data.allowedJids,
        },
      });

      Object.assign(this.localChatwoot, { ...data, signDelimiter: data.signMsg ? data.signDelimiter : null });

      this.clearCacheChatwoot();
      return;
    }

    await this.prismaRepository.chatwoot.create({
      data: {
        enabled: data?.enabled,
        accountId: data.accountId,
        token: data.token,
        url: data.url,
        nameInbox: data.nameInbox,
        signMsg: data.signMsg,
        number: data.number,
        reopenConversation: data.reopenConversation,
        conversationPending: data.conversationPending,
        mergeBrazilContacts: data.mergeBrazilContacts,
        importContacts: data.importContacts,
        importMessages: data.importMessages,
        daysLimitImportMessages: data.daysLimitImportMessages,
        organization: data.organization,
        logo: data.logo,
        ignoreJids: data.ignoreJids,
        allowedJids: data.allowedJids,
        instanceId: this.instanceId,
      },
    });

    Object.assign(this.localChatwoot, { ...data, signDelimiter: data.signMsg ? data.signDelimiter : null });

    this.clearCacheChatwoot();
  }

  public async findChatwoot(): Promise<ChatwootDto | null> {
    if (!this.configService.get<Chatwoot>('CHATWOOT').ENABLED) {
      return null;
    }

    const data = await this.prismaRepository.chatwoot.findUnique({
      where: {
        instanceId: this.instanceId,
      },
    });

    if (!data) {
      return null;
    }

    const ignoreJidsArray = Array.isArray(data.ignoreJids) ? data.ignoreJids.map((event) => String(event)) : [];
    const allowedJidsArray = Array.isArray(data.allowedJids) ? data.allowedJids.map((event) => String(event)) : [];

    return {
      enabled: data?.enabled,
      accountId: data.accountId,
      token: data.token,
      url: data.url,
      nameInbox: data.nameInbox,
      signMsg: data.signMsg,
      signDelimiter: data.signDelimiter || null,
      reopenConversation: data.reopenConversation,
      conversationPending: data.conversationPending,
      mergeBrazilContacts: data.mergeBrazilContacts,
      importContacts: data.importContacts,
      importMessages: data.importMessages,
      daysLimitImportMessages: data.daysLimitImportMessages,
      organization: data.organization,
      logo: data.logo,
      ignoreJids: ignoreJidsArray,
      allowedJids: allowedJidsArray,
    };
  }

  public clearCacheChatwoot() {
    if (this.localChatwoot?.enabled) {
      this.chatwootService.getCache()?.deleteAll(this.instanceName);
    }
  }

  public async loadProxy() {
    this.localProxy.enabled = false;

    const proxyConfig = this.configService.get<Proxy>('PROXY');
    if (proxyConfig.HOST) {
      this.localProxy.enabled = true;
      this.localProxy.host = proxyConfig.HOST;
      this.localProxy.port = proxyConfig.PORT || '80';
      this.localProxy.protocol = proxyConfig.PROTOCOL || 'http';
      this.localProxy.username = proxyConfig.USERNAME;
      this.localProxy.password = proxyConfig.PASSWORD;
    }

    const data = await this.prismaRepository.proxy.findUnique({
      where: {
        instanceId: this.instanceId,
      },
    });

    if (data?.enabled) {
      this.localProxy.enabled = true;
      this.localProxy.host = data?.host;
      this.localProxy.port = data?.port;
      this.localProxy.protocol = data?.protocol;
      this.localProxy.username = data?.username;
      this.localProxy.password = data?.password;
    }
  }

  public async setProxy(data: ProxyDto) {
    await this.prismaRepository.proxy.upsert({
      where: {
        instanceId: this.instanceId,
      },
      update: {
        enabled: data?.enabled,
        host: data.host,
        port: data.port,
        protocol: data.protocol,
        username: data.username,
        password: data.password,
      },
      create: {
        enabled: data?.enabled,
        host: data.host,
        port: data.port,
        protocol: data.protocol,
        username: data.username,
        password: data.password,
        instanceId: this.instanceId,
      },
    });

    Object.assign(this.localProxy, data);
  }

  public async findProxy() {
    const data = await this.prismaRepository.proxy.findUnique({
      where: {
        instanceId: this.instanceId,
      },
    });

    if (!data) {
      throw new NotFoundException('Proxy not found');
    }

    return data;
  }

  public async sendDataWebhook<T extends object = any>(
    event: Events,
    data: T,
    local = true,
    integration?: string[],
    extra?: Record<string, any>,
  ) {
    const serverUrl = this.configService.get<HttpServer>('SERVER').URL;
    const tzoffset = new Date().getTimezoneOffset() * 60000; //offset in milliseconds
    const localISOTime = new Date(Date.now() - tzoffset).toISOString();
    const now = localISOTime;

    const expose = this.configService.get<Auth>('AUTHENTICATION').EXPOSE_IN_FETCH_INSTANCES;

    const instanceApikey = this.token || 'Apikey not found';

    await eventManager.emit({
      instanceName: this.instance.name,
      origin: ChannelStartupService.name,
      event,
      data,
      serverUrl,
      dateTime: now,
      sender: this.wuid,
      apiKey: expose && instanceApikey ? instanceApikey : null,
      local,
      integration,
      extra,
    });
  }

  // Check if the number is MX or AR
  public formatMXOrARNumber(jid: string): string {
    const countryCode = jid.substring(0, 2);

    if (Number(countryCode) === 52 || Number(countryCode) === 54) {
      if (jid.length === 13) {
        const number = countryCode + jid.substring(3);
        return number;
      }

      return jid;
    }
    return jid;
  }

  // Check if the number is br
  public formatBRNumber(jid: string) {
    const regexp = new RegExp(/^(\d{2})(\d{2})\d{1}(\d{8})$/);
    if (regexp.test(jid)) {
      const match = regexp.exec(jid);
      if (match && match[1] === '55') {
        const joker = Number.parseInt(match[3][0]);
        const ddd = Number.parseInt(match[2]);
        if (joker < 7 || ddd < 31) {
          return match[0];
        }
        return match[1] + match[2] + match[3];
      }
      return jid;
    } else {
      return jid;
    }
  }

  public async fetchContacts(query: Query<Contact>) {
    const where: any = {
      instanceId: this.instanceId,
    };

    if (query?.where?.remoteJid) {
      const remoteJid = query.where.remoteJid.includes('@') ? query.where.remoteJid : createJid(query.where.remoteJid);
      where['remoteJid'] = remoteJid;
    }

    if (query?.where?.id) {
      where['id'] = query.where.id;
    }

    if (query?.where?.pushName) {
      where['pushName'] = query.where.pushName;
    }

    const contactFindManyArgs: Prisma.ContactFindManyArgs = {
      where,
    };

    if (query.offset) contactFindManyArgs.take = query.offset;
    if (query.page) {
      const validPage = Math.max(query.page as number, 1);
      contactFindManyArgs.skip = query.offset * (validPage - 1);
    }

    const contacts = await this.prismaRepository.contact.findMany(contactFindManyArgs);

    return contacts.map((contact) => {
      const remoteJid = contact.remoteJid;
      const isGroup = remoteJid.endsWith('@g.us');
      const isSaved = !!contact.pushName || !!contact.profilePicUrl;
      const type = isGroup ? 'group' : isSaved ? 'contact' : 'group_member';
      return {
        ...contact,
        isGroup,
        isSaved,
        type,
      };
    });
  }

  public cleanMessageData(message: any) {
    if (!message) return message;
    const cleanedMessage = { ...message };

    if (cleanedMessage.message) {
      const { mediaUrl } = cleanedMessage.message;
      delete cleanedMessage.message.base64;

      // Limpa imageMessage
      if (cleanedMessage.message.imageMessage) {
        cleanedMessage.message.imageMessage = {
          caption: cleanedMessage.message.imageMessage.caption,
        };
      }

      // Limpa videoMessage
      if (cleanedMessage.message.videoMessage) {
        cleanedMessage.message.videoMessage = {
          caption: cleanedMessage.message.videoMessage.caption,
        };
      }

      // Limpa audioMessage
      if (cleanedMessage.message.audioMessage) {
        cleanedMessage.message.audioMessage = {
          seconds: cleanedMessage.message.audioMessage.seconds,
        };
      }

      // Limpa stickerMessage
      if (cleanedMessage.message.stickerMessage) {
        cleanedMessage.message.stickerMessage = {};
      }

      // Limpa documentMessage
      if (cleanedMessage.message.documentMessage) {
        cleanedMessage.message.documentMessage = {
          caption: cleanedMessage.message.documentMessage.caption,
          name: cleanedMessage.message.documentMessage.name,
        };
      }

      // Limpa documentWithCaptionMessage
      if (cleanedMessage.message.documentWithCaptionMessage) {
        cleanedMessage.message.documentWithCaptionMessage = {
          caption: cleanedMessage.message.documentWithCaptionMessage.caption,
          name: cleanedMessage.message.documentWithCaptionMessage.name,
        };
      }

      if (mediaUrl) cleanedMessage.message.mediaUrl = mediaUrl;
    }

    return cleanedMessage;
  }

  public async fetchMessages(query: Query<Message>) {
    const keyFilters = query?.where?.key as {
      id?: string;
      fromMe?: boolean;
      remoteJid?: string;
      participants?: string;
    };

    const timestampFilter = {};
    if (query?.where?.messageTimestamp) {
      if (query.where.messageTimestamp['gte'] && query.where.messageTimestamp['lte']) {
        timestampFilter['messageTimestamp'] = {
          gte: Math.floor(new Date(query.where.messageTimestamp['gte']).getTime() / 1000),
          lte: Math.floor(new Date(query.where.messageTimestamp['lte']).getTime() / 1000),
        };
      }
    }

    const count = await this.prismaRepository.message.count({
      where: {
        instanceId: this.instanceId,
        id: query?.where?.id,
        source: query?.where?.source,
        messageType: query?.where?.messageType,
        ...timestampFilter,
        AND: [
          keyFilters?.id ? { key: { path: ['id'], equals: keyFilters?.id } } : {},
          keyFilters?.fromMe ? { key: { path: ['fromMe'], equals: keyFilters?.fromMe } } : {},
          keyFilters?.remoteJid ? { key: { path: ['remoteJid'], equals: keyFilters?.remoteJid } } : {},
          keyFilters?.participants ? { key: { path: ['participants'], equals: keyFilters?.participants } } : {},
        ],
      },
    });

    if (!query?.offset) {
      query.offset = 50;
    }

    if (!query?.page) {
      query.page = 1;
    }

    const messages = await this.prismaRepository.message.findMany({
      where: {
        instanceId: this.instanceId,
        id: query?.where?.id,
        source: query?.where?.source,
        messageType: query?.where?.messageType,
        ...timestampFilter,
        AND: [
          keyFilters?.id ? { key: { path: ['id'], equals: keyFilters?.id } } : {},
          keyFilters?.fromMe ? { key: { path: ['fromMe'], equals: keyFilters?.fromMe } } : {},
          keyFilters?.remoteJid ? { key: { path: ['remoteJid'], equals: keyFilters?.remoteJid } } : {},
          keyFilters?.participants ? { key: { path: ['participants'], equals: keyFilters?.participants } } : {},
        ],
      },
      orderBy: {
        messageTimestamp: 'desc',
      },
      skip: query.offset * (query?.page === 1 ? 0 : (query?.page as number) - 1),
      take: query.offset,
      select: {
        id: true,
        key: true,
        pushName: true,
        messageType: true,
        message: true,
        messageTimestamp: true,
        instanceId: true,
        source: true,
        contextInfo: true,
        MessageUpdate: {
          select: {
            status: true,
          },
        },
      },
    });

    return {
      messages: {
        total: count,
        pages: Math.ceil(count / query.offset),
        currentPage: query.page,
        records: messages,
      },
    };
  }

  public async fetchStatusMessage(query: any) {
    if (!query?.offset) {
      query.offset = 50;
    }

    if (!query?.page) {
      query.page = 1;
    }

    return await this.prismaRepository.messageUpdate.findMany({
      where: {
        instanceId: this.instanceId,
        remoteJid: query.where?.remoteJid,
        keyId: query.where?.id,
      },
      skip: query.offset * (query?.page === 1 ? 0 : (query?.page as number) - 1),
      take: query.offset,
    });
  }

  public async findChatByRemoteJid(remoteJid: string) {
    if (!remoteJid) return null;
    return await this.prismaRepository.chat.findFirst({
      where: {
        instanceId: this.instanceId,
        remoteJid: remoteJid,
      },
    });
  }

  public async fetchChats(query: any) {
    const remoteJid = query?.where?.remoteJid
      ? query?.where?.remoteJid.includes('@')
        ? query.where?.remoteJid
        : createJid(query.where?.remoteJid)
      : null;

    const where = {
      instanceId: this.instanceId,
    };

    if (remoteJid) {
      where['remoteJid'] = remoteJid;
    }

    const timestampFilter =
      query?.where?.messageTimestamp?.gte && query?.where?.messageTimestamp?.lte
        ? Prisma.sql`
        AND "Message"."messageTimestamp" >= ${Math.floor(new Date(query.where.messageTimestamp.gte).getTime() / 1000)}
        AND "Message"."messageTimestamp" <= ${Math.floor(new Date(query.where.messageTimestamp.lte).getTime() / 1000)}`
        : Prisma.sql``;

    // Buscar por telefono no encontraba los chats "@lid": ahi el remoteJid
    // guardado es el identificador opaco, asi que el ILIKE contra remoteJid no
    // matchea nunca. Se traducen primero los telefonos buscados a sus lids.
    const searchTerm = query?.where?.pushName;
    const lidJidsMatchingSearch = searchTerm ? await this.findLidJidsByNumber(searchTerm) : [];
    const lidSearchFilter = lidJidsMatchingSearch.length
      ? Prisma.sql`OR "Message"."key"->>'remoteJid' IN (${Prisma.join(lidJidsMatchingSearch)})`
      : Prisma.sql``;

    // Busqueda por nombre: con miles de contactos no se puede mandar todo al
    // cliente, asi que el filtro corre en SQL antes del LIMIT/OFFSET.
    const pushNameFilter = searchTerm
      ? Prisma.sql`
        AND (
          "Contact"."pushName" ILIKE ${'%' + searchTerm + '%'}
          OR "Chat"."name" ILIKE ${'%' + searchTerm + '%'}
          OR "Message"."pushName" ILIKE ${'%' + searchTerm + '%'}
          OR "Message"."key"->>'remoteJid' ILIKE ${'%' + searchTerm + '%'}
          ${lidSearchFilter}
        )`
      : Prisma.sql``;

    const limit = query?.take ? Prisma.sql`LIMIT ${query.take}` : Prisma.sql``;
    const offset = query?.skip ? Prisma.sql`OFFSET ${query.skip}` : Prisma.sql``;

    // $queryRaw sin parametro de tipo devuelve `unknown`, y entonces
    // results.length/.map no compilan. Las columnas salen de un SELECT crudo, asi
    // que no hay tipo generado que aplicar: any[] es lo honesto aqui.
    const results = await this.prismaRepository.$queryRaw<any[]>`
      WITH rankedMessages AS (
        SELECT DISTINCT ON ("Message"."key"->>'remoteJid') 
          "Contact"."id" as "contactId",
          "Message"."key"->>'remoteJid' as "remoteJid",
          -- Un solo alias "pushName": habia un segundo '"Chat"."name" as "pushName"'
          -- mas abajo que pisaba este COALESCE al mapear la fila a objeto, asi que
          -- el nombre siempre acababa siendo Chat.name — NULL en chats 1:1, donde
          -- el nombre vive en Contact.pushName. Resultado: los pickers de
          -- privacidad mostraban el numero crudo del JID en vez del nombre.
          CASE
            WHEN "Message"."key"->>'remoteJid' LIKE '%@g.us' THEN COALESCE("Chat"."name", "Contact"."pushName")
            ELSE COALESCE("Contact"."pushName", "Message"."pushName")
          END as "pushName",
          "Contact"."profilePicUrl",
          COALESCE(
            to_timestamp("Message"."messageTimestamp"::double precision), 
            "Contact"."updatedAt"
          ) as "updatedAt",
          "Chat"."createdAt" as "windowStart",
          "Chat"."createdAt" + INTERVAL '24 hours' as "windowExpires",
          "Chat"."unreadMessages" as "unreadMessages",
          CASE WHEN "Chat"."createdAt" + INTERVAL '24 hours' > NOW() THEN true ELSE false END as "windowActive",
          "Message"."id" AS "lastMessageId",
          "Message"."key" AS "lastMessage_key",
          CASE
            WHEN "Message"."key"->>'fromMe' = 'true' THEN 'Você'
            ELSE "Message"."pushName"
          END AS "lastMessagePushName",
          "Message"."participant" AS "lastMessageParticipant",
          "Message"."messageType" AS "lastMessageMessageType",
          "Message"."message" AS "lastMessageMessage",
          "Message"."contextInfo" AS "lastMessageContextInfo",
          "Message"."source" AS "lastMessageSource",
          "Message"."messageTimestamp" AS "lastMessageMessageTimestamp",
          "Message"."instanceId" AS "lastMessageInstanceId",
          "Message"."sessionId" AS "lastMessageSessionId",
          "Message"."status" AS "lastMessageStatus"
        FROM "Message"
        LEFT JOIN "Contact" ON "Contact"."remoteJid" = "Message"."key"->>'remoteJid' AND "Contact"."instanceId" = "Message"."instanceId"
        LEFT JOIN "Chat" ON "Chat"."remoteJid" = "Message"."key"->>'remoteJid' AND "Chat"."instanceId" = "Message"."instanceId"
        WHERE "Message"."instanceId" = ${this.instanceId}
        ${remoteJid ? Prisma.sql`AND "Message"."key"->>'remoteJid' = ${remoteJid}` : Prisma.sql``}
        ${timestampFilter}
        ${pushNameFilter}
        ORDER BY "Message"."key"->>'remoteJid', "Message"."messageTimestamp" DESC
      )
      SELECT * FROM rankedMessages 
      ORDER BY "updatedAt" DESC NULLS LAST
      ${limit}
      ${offset};
    `;

    if (results && isArray(results) && results.length > 0) {
      const lidPhoneNumbers = await this.resolveLidPhoneNumbers(results.map((row) => row.remoteJid));

      const mappedResults = results.map((contact) => {
        const lastMessage = contact.lastMessageId
          ? {
              id: contact.lastMessageId,
              key: contact.lastMessage_key,
              pushName: contact.lastMessagePushName,
              participant: contact.lastMessageParticipant,
              messageType: contact.lastMessageMessageType,
              message: contact.lastMessageMessage,
              contextInfo: contact.lastMessageContextInfo,
              source: contact.lastMessageSource,
              messageTimestamp: contact.lastMessageMessageTimestamp,
              instanceId: contact.lastMessageInstanceId,
              sessionId: contact.lastMessageSessionId,
              status: contact.lastMessageStatus,
            }
          : undefined;

        const phoneNumber = lidPhoneNumbers.get(contact.remoteJid) ?? null;

        return {
          id: contact.contactId || null,
          remoteJid: contact.remoteJid,
          // Ultimo recurso: el telefono equivalente del lid. Sin esto, un chat
          // migrado a "@lid" y sin pushName se muestra como los 15 digitos
          // opacos del lid, indistinguible del resto en el picker de privacidad.
          pushName: contact.pushName || phoneNumber,
          remoteJidAlt: phoneNumber ? `${phoneNumber}@s.whatsapp.net` : null,
          profilePicUrl: contact.profilePicUrl,
          updatedAt: contact.updatedAt,
          windowStart: contact.windowStart,
          windowExpires: contact.windowExpires,
          windowActive: contact.windowActive,
          lastMessage: lastMessage ? this.cleanMessageData(lastMessage) : undefined,
          unreadCount: contact.unreadMessages,
          isSaved: !!contact.contactId,
        };
      });

      return mappedResults;
    }

    return [];
  }

  // WhatsApp entrega cada vez mas chats con el identificador opaco de privacidad
  // ("204987654321098@lid"), que no es el telefono y no se deduce de el. En el
  // picker de privacidad esos chats son indistinguibles entre si.
  //
  // saveOnWhatsappCache guarda todas las formas del mismo chat en
  // IsOnWhatsapp.jidOptions (lista separada por comas) y deja el telefono en
  // remoteJid, asi que el mapeo lid->telefono es recuperable. Una sola consulta
  // por pagina de resultados, nunca una por fila: jidOptions no esta indexado.
  // Traduce un telefono buscado a los JIDs "@lid" del mismo chat, para que el
  // buscador del picker encuentre por numero los contactos que WhatsApp migro a
  // lid. Se exige un minimo de digitos para no escanear la tabla entera con
  // terminos triviales, y el resultado va acotado.
  private async findLidJidsByNumber(term: string): Promise<string[]> {
    const digits = term.replace(/\D/g, '');

    if (digits.length < 6) {
      return [];
    }

    try {
      const rows = await this.prismaRepository.isOnWhatsapp.findMany({
        where: { jidOptions: { contains: digits } },
        select: { jidOptions: true },
        take: 50,
      });

      return [...new Set(rows.flatMap((row) => row.jidOptions?.split(',') ?? []))].filter((jid) =>
        jid.endsWith('@lid'),
      );
    } catch (error) {
      this.logger.warn(`Could not resolve lid jids for search term: ${error}`);
      return [];
    }
  }

  private async resolveLidPhoneNumbers(remoteJids: string[]): Promise<Map<string, string>> {
    const lidJids = [...new Set(remoteJids.filter((jid) => jid?.endsWith('@lid')))];
    const resolved = new Map<string, string>();

    if (lidJids.length === 0) {
      return resolved;
    }

    try {
      const rows = await this.prismaRepository.isOnWhatsapp.findMany({
        where: { OR: lidJids.map((jid) => ({ jidOptions: { contains: jid } })) },
        select: { remoteJid: true, jidOptions: true },
      });

      for (const jid of lidJids) {
        // `contains` puede matchear de mas (un lid contenido en otro mas largo),
        // asi que el match final se confirma contra la lista ya separada.
        const match = rows.find((row) => row.jidOptions?.split(',').includes(jid));

        if (match && !match.remoteJid.includes('@lid')) {
          resolved.set(jid, match.remoteJid.split('@')[0]);
        }
      }
    } catch (error) {
      // Es solo una mejora de etiqueta: si falla, el chat sale con su lid crudo
      // como antes en vez de tumbar el listado entero.
      this.logger.warn(`Could not resolve phone numbers for lid jids: ${error}`);
    }

    return resolved;
  }

  public hasValidMediaContent(message: any): boolean {
    if (!message?.message) return false;

    const msg = message.message;

    // Se só tem messageContextInfo, não é mídia válida
    if (Object.keys(msg).length === 1 && Object.prototype.hasOwnProperty.call(msg, 'messageContextInfo')) {
      return false;
    }

    // Verifica se tem pelo menos um tipo de mídia válido
    const mediaTypes = [
      'imageMessage',
      'videoMessage',
      'stickerMessage',
      'documentMessage',
      'documentWithCaptionMessage',
      'ptvMessage',
      'audioMessage',
    ];

    return mediaTypes.some((type) => msg[type] && Object.keys(msg[type]).length > 0);
  }
}
