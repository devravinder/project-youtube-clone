package dev.ytclone.transcoder.adapter.in.messaging;

import dev.ytclone.transcoder.domain.TranscodeJob;
import org.mapstruct.Mapper;
import org.mapstruct.MappingConstants;

@Mapper(componentModel = MappingConstants.ComponentModel.SPRING)
public interface TranscodeCommandMapper {

  TranscodeJob toJob(TranscodeCommandMessage message);
}
