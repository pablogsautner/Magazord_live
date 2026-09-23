-- Destino opcional de simulcast (forward RTMP) por live — ex: TikTok Live
-- Studio. Vazio = comportamento de hoje (sem forward nenhum).
alter table lives add column multicanal_rtmp_server_url text;
alter table lives add column multicanal_rtmp_stream_key text;
