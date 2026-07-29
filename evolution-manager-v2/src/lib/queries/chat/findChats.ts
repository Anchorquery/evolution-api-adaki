import { useQuery } from "@tanstack/react-query";

import { api } from "../api";
import { UseQueryParams } from "../types";
import { FindChatsResponse } from "./types";

interface IParams {
  instanceName: string;
  search?: string;
  take?: number;
  skip?: number;
}

const queryKey = (params: Partial<IParams>) => ["chats", "findChats", JSON.stringify(params)];

export const findChats = async ({ instanceName, search, take, skip }: IParams) => {
  const response = await api.post(`/chat/findChats/${instanceName}`, {
    where: search ? { pushName: search } : {},
    take,
    skip,
  });
  return response.data;
};

export const useFindChats = (props: UseQueryParams<FindChatsResponse> & Partial<IParams>) => {
  const { instanceName, search, take, skip, ...rest } = props;
  return useQuery<FindChatsResponse>({
    ...rest,
    queryKey: queryKey({ instanceName, search, take, skip }),
    queryFn: () => findChats({ instanceName: instanceName!, search, take, skip }),
    enabled: !!instanceName,
  });
};
