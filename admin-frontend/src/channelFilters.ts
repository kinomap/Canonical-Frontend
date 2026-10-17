export type ChannelFilter = 'ACTIVE' | 'INACTIVE' | 'ALL'
export function filterChannels<T extends {status?: string}>(channels: T[], filter: ChannelFilter): T[] {
  return channels.filter(channel => filter === 'ALL' || (filter === 'ACTIVE' ? channel.status === 'ACTIVE' : channel.status !== 'ACTIVE'))
}
