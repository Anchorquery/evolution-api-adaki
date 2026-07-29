import { useQuery } from "@tanstack/react-query";

import { api } from "../api";
import { UseQueryParams } from "../types";

interface IParams {
  instanceName: string;
}

export interface GroupSummary {
  id: string;
  subject: string;
  pictureUrl?: string;
  size?: number;
}

const queryKey = (params: Partial<IParams>) => ["group", "fetchAllGroups", JSON.stringify(params)];

export const fetchAllGroups = async ({ instanceName }: IParams) => {
  const response = await api.get(`/group/fetchAllGroups/${instanceName}`, {
    params: { getParticipants: "false" },
  });
  return response.data as GroupSummary[];
};

export const useFetchAllGroups = (props: UseQueryParams<GroupSummary[]> & Partial<IParams>) => {
  const { instanceName, ...rest } = props;
  return useQuery<GroupSummary[]>({
    ...rest,
    queryKey: queryKey({ instanceName }),
    queryFn: () => fetchAllGroups({ instanceName: instanceName! }),
    enabled: !!instanceName,
  });
};
