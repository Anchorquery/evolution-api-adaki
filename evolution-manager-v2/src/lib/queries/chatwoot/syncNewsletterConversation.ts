import { api } from "../api";
import { useManageMutation } from "../mutateQuery";

interface IParams {
  instanceName: string;
  jid: string;
  name?: string;
}

const syncNewsletterConversation = async ({ instanceName, jid, name }: IParams) => {
  const response = await api.post(`/chatwoot/syncNewsletter/${instanceName}`, { jid, name });
  return response.data as { conversationId: number };
};

export function useSyncNewsletterConversation() {
  const mutate = useManageMutation(syncNewsletterConversation);

  return { syncNewsletterConversation: mutate };
}
