package com.medcord.call;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "calls")
@Getter
@Setter
public class Call {
    public enum Media { AUDIO, VIDEO }
    public enum Status {
        RINGING, CONNECTED, ENDED, MISSED, DECLINED, CANCELLED, FAILED;
        public boolean isFinal() { return this != RINGING && this != CONNECTED; }
    }

    @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;
    @Column(name = "channel_id", nullable = false) private UUID channelId;
    @Column(name = "caller_id", nullable = false) private UUID callerId;
    @Column(name = "callee_id", nullable = false) private UUID calleeId;
    @Enumerated(EnumType.STRING) @Column(nullable = false) private Media media;
    @Enumerated(EnumType.STRING) @Column(nullable = false) private Status status = Status.RINGING;
    @Column(name = "provider_call_id") private String providerCallId;
    @Column(name = "created_at", nullable = false) private Instant createdAt = Instant.now();
    @Column(name = "connected_at") private Instant connectedAt;
    @Column(name = "ended_at") private Instant endedAt;
    @Column(name = "ended_by") private UUID endedBy;

    public boolean involves(UUID userId) { return callerId.equals(userId) || calleeId.equals(userId); }
}
