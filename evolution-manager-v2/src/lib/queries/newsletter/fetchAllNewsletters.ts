import { useQuery } from "@tanstack/react-query";

import { api } from "../api";
import { UseQueryParams } from "../types";

interface IParams {
  instanceName: string;
}

export interface NewsletterSummary {
  id: string;
  name: string;
  description?: string;
  pictureUrl?: string;
}

const queryKey = (params: Partial<IParams>) => ["newsletter", "fetchAll", JSON.stringify(params)];

export const fetchAllNewsletters = async ({ instanceName }: IParams) => {
  const response = await api.get(`/newsletter/find/${instanceName}`);
  return response.data as NewsletterSummary[];
};

export const useFetchAllNewsletters = (props: UseQueryParams<NewsletterSummary[]> & Partial<IParams>) => {
  const { instanceName, ...rest } = props;
  return useQuery<NewsletterSummary[]>({
    ...rest,
    queryKey: queryKey({ instanceName }),
    queryFn: () => fetchAllNewsletters({ instanceName: instanceName! }),
    enabled: !!instanceName,
  });
};
