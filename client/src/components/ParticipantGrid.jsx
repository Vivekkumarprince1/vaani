import { memo } from 'react';
import ParticipantTile from './ParticipantTile';

/**
 * ParticipantGrid
 * Single responsibility: lay out participant tiles in a responsive grid.
 * Supports 1-to-many participants with automatic column selection.
 */
const gridCols = (count) => {
  if (count <= 1) return 'grid-cols-1';
  if (count <= 4) return 'grid-cols-2';
  if (count <= 9) return 'grid-cols-3';
  return 'grid-cols-4';
};

const ParticipantGrid = ({
  localParticipant,
  remoteParticipants,
  activeSpeakerId,
  participantLanguages = {},
}) => {
  const totalCount = 1 + (remoteParticipants?.length || 0);
  const colClass = gridCols(totalCount);

  return (
    <div className={`grid ${colClass} gap-2 w-full h-full p-2`}>
      {/* Local participant tile always shown first */}
      {localParticipant && (
        <ParticipantTile
          participant={localParticipant}
          isLocal={true}
          isActiveSpeaker={activeSpeakerId === localParticipant.identity}
          preferredLanguage={participantLanguages[localParticipant.identity]}
        />
      )}

      {/* Remote participant tiles */}
      {remoteParticipants?.map((participant) => (
        <ParticipantTile
          key={participant.identity}
          participant={participant}
          isLocal={false}
          isActiveSpeaker={activeSpeakerId === participant.identity}
          preferredLanguage={participantLanguages[participant.identity]}
        />
      ))}
    </div>
  );
};

export default memo(ParticipantGrid);
