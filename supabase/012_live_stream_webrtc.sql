-- Sai do YouTube: daqui pra frente toda live nova usa o servidor de live
-- próprio (WebRTC via SRS), não mais o YouTube. youtube_video_id passa a ser
-- opcional — continua preenchido nas lives antigas (não muda nada pra elas),
-- mas nenhuma live nova vai usá-lo. O próprio valor (null ou preenchido) já
-- diz qual sistema aquela live usa; não precisa de uma coluna de "modo".
alter table lives alter column youtube_video_id drop not null;
