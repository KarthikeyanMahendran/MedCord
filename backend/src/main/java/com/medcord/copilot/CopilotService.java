package com.medcord.copilot;

import com.medcord.attachment.AttachmentService;
import com.medcord.attachment.AttachmentService.AttachmentDto;
import com.medcord.common.ApiException;
import com.medcord.community.Channel;
import com.medcord.community.ChannelRepository;
import com.medcord.community.Permission;
import com.medcord.copilot.ClinicalSynthesizer.ContextItem;
import com.medcord.copilot.ClinicalSynthesizer.Mode;
import com.medcord.message.ChannelAccess;
import com.medcord.message.Message;
import com.medcord.message.MessageDtos.MessageDto;
import com.medcord.message.MessageRepository;
import com.medcord.message.MessageService;
import com.medcord.message.MessageThread;
import com.medcord.message.ThreadRepository;
import com.medcord.nexconn.NexconnGateway;
import com.medcord.realtime.RealtimeEvent;
import com.medcord.realtime.RealtimeHub;
import com.medcord.safety.PhiDetector;
import com.medcord.user.ProfessionalProfile;
import com.medcord.user.ProfessionalProfileRepository;
import com.medcord.user.User;
import com.medcord.user.UserRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Live AI Clinical Co-Pilot backed by real-time token streaming over MedCord's SSE RealtimeHub
 * and mirrored to Nexconn StreamMessage (RC:StreamMsg) when Nexconn is configured.
 * All clinical context is automatically de-identified via {@link PhiDetector} before synthesis.
 */
@Service
public class CopilotService {
    private static final Logger log = LoggerFactory.getLogger(CopilotService.class);

    private final CopilotProperties props;
    private final ChannelRepository channels;
    private final MessageRepository messages;
    private final ThreadRepository threads;
    private final UserRepository users;
    private final ProfessionalProfileRepository profiles;
    private final AttachmentService attachments;
    private final ChannelAccess access;
    private final MessageService messageService;
    private final RealtimeHub realtime;
    private final NexconnGateway nexconn;
    private final com.medcord.moderation.MuteRepository mutes;
    private final TransactionTemplate tx;
    private final RestClient http;
    private final ObjectMapper json = new ObjectMapper();

    public CopilotService(CopilotProperties props, ChannelRepository channels, MessageRepository messages,
                          ThreadRepository threads, UserRepository users, ProfessionalProfileRepository profiles,
                          AttachmentService attachments, ChannelAccess access, MessageService messageService,
                          RealtimeHub realtime, NexconnGateway nexconn, com.medcord.moderation.MuteRepository mutes,
                          PlatformTransactionManager txManager) {
        this.props = props;
        this.channels = channels;
        this.messages = messages;
        this.threads = threads;
        this.users = users;
        this.profiles = profiles;
        this.attachments = attachments;
        this.access = access;
        this.messageService = messageService;
        this.realtime = realtime;
        this.nexconn = nexconn;
        this.mutes = mutes;
        this.tx = new TransactionTemplate(txManager);
        SimpleClientHttpRequestFactory f = new SimpleClientHttpRequestFactory();
        f.setConnectTimeout(Duration.ofSeconds(5));
        f.setReadTimeout(Duration.ofSeconds(25));
        this.http = RestClient.builder().requestFactory(f).build();
    }

    public record CopilotResponse(String streamId, MessageDto message, boolean nexconnStreamEnabled) {}

    @Transactional
    public CopilotResponse invoke(UUID channelId, UUID actorId, Mode mode, String prompt, UUID threadId) {
        Channel ch = channels.findById(channelId)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Channel not found"));
        Set<Permission> held = access.permissions(ch, actorId);
        if (ch.isArchived()) throw new ApiException(HttpStatus.CONFLICT, "This channel is archived and read-only");
        access.assertCanPost(ch, actorId);
        if (ch.getCommunityId() != null) {
            mutes.findByCommunityIdAndUserId(ch.getCommunityId(), actorId)
                .filter(x -> x.getUntil().isAfter(Instant.now()))
                .ifPresent(x -> {
                    throw new ApiException(HttpStatus.FORBIDDEN, "You are muted in this community until " + x.getUntil());
                });
        }
        if (!held.contains(Permission.SEND_MESSAGES)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Missing permission: SEND_MESSAGES");
        }
        MessageThread thread = null;
        if (threadId != null) {
            thread = threads.findById(threadId)
                .filter(t -> t.getChannelId().equals(channelId))
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Thread not found in this channel"));
            if (thread.isArchived()) throw new ApiException(HttpStatus.CONFLICT, "This thread is archived");
        }
        if (mode == Mode.ASK && (prompt == null || prompt.isBlank())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Please enter a clinical question for Co-Pilot");
        }

        // Gather recent messages (and voice note transcripts!) for clinical synthesis.
        List<Message> recent = loadContextMessages(channelId, thread);
        List<ContextItem> contextItems = buildContextItems(recent);

        // Create the persisted AI message placeholder immediately so everyone sees it appear.
        Message aiMsg = new Message();
        aiMsg.setChannelId(channelId);
        aiMsg.setAuthorId(actorId);
        aiMsg.setKind("AI");
        aiMsg.setBody("_Clinical Co-Pilot is analyzing de-identified context…_");
        if (thread != null) aiMsg.setThreadId(thread.getId());
        aiMsg = messages.saveAndFlush(aiMsg);

        String streamId = "mc-stream-" + aiMsg.getId().toString().replace("-", "");
        UUID savedMsgId = aiMsg.getId();
        UUID savedThreadId = thread == null ? null : thread.getId();
        UUID communityId = ch.getCommunityId();
        boolean isDm = ch.getType() == Channel.Type.DM;
        String channelName = ch.getName();
        String senderNexconnId = NexconnGateway.toNexconnUserId(actorId);
        String targetNexconnId = NexconnGateway.toNexconnUserId(channelId);

        realtime.onMessageSent(communityId, channelId, savedMsgId);
        realtime.publishToChannel(channelId, RealtimeEvent.of("AI_STREAM_INIT", channelId, communityId,
            streamPayload(streamId, savedMsgId, savedThreadId, "", "", false)));

        // Launch the virtual streaming thread only after the placeholder message commits to Postgres.
        Runnable startStream = () -> Thread.ofVirtual().name("copilot-stream-" + savedMsgId).start(() ->
            runStream(streamId, savedMsgId, savedThreadId, channelId, communityId, isDm,
                channelName, senderNexconnId, targetNexconnId, mode, prompt, contextItems)
        );
        if (TransactionSynchronizationManager.isActualTransactionActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCommit() { startStream.run(); }
            });
        } else {
            startStream.run();
        }

        MessageDto dto = messageService.dto(aiMsg, actorId);
        return new CopilotResponse(streamId, dto, nexconn.enabled());
    }

    private void runStream(String streamId, UUID messageId, UUID threadId, UUID channelId, UUID communityId,
                           boolean isDm, String channelName, String senderNexconnId, String targetNexconnId,
                           Mode mode, String prompt, List<ContextItem> contextItems) {
        try {
            String fullMarkdown = generateMarkdown(mode, channelName, prompt, contextItems);
            if (fullMarkdown.length() > 3950) {
                fullMarkdown = fullMarkdown.substring(0, 3945) + "\n…";
            }
            List<String> chunks = ClinicalSynthesizer.chunkTokens(fullMarkdown);
            StringBuilder acc = new StringBuilder();
            long delay = props.chunkDelayMs();

            for (int i = 0; i < chunks.size(); i++) {
                String delta = chunks.get(i);
                acc.append(delta);
                boolean last = (i == chunks.size() - 1);
                realtime.publishToChannel(channelId, RealtimeEvent.of("AI_STREAM_DELTA", channelId, communityId,
                    streamPayload(streamId, messageId, threadId, delta, acc.toString(), last)));
                if (delay > 0 && !last) {
                    try { Thread.sleep(delay); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); break; }
                }
            }

            final String finalText = acc.toString();
            tx.executeWithoutResult(status -> messages.findById(messageId).ifPresent(m -> {
                m.setBody(finalText);
                messages.saveAndFlush(m);
            }));

            // Mirror completed StreamMessage (RC:StreamMsg) to Nexconn when configured
            nexconn.mirrorStreamMessage(isDm, targetNexconnId, senderNexconnId, streamId, finalText, true);

            realtime.publishToChannel(channelId, RealtimeEvent.of("AI_STREAM_COMPLETE", channelId, communityId,
                streamPayload(streamId, messageId, threadId, "", finalText, true)));
            realtime.onMessageEdited(communityId, channelId, messageId);
        } catch (Exception ex) {
            log.warn("Co-Pilot stream {} failed: {}", streamId, ex.getMessage());
            String fallback = "Clinical Co-Pilot encountered a temporary issue. Please try again.";
            tx.executeWithoutResult(status -> messages.findById(messageId).ifPresent(m -> {
                m.setBody(fallback);
                messages.saveAndFlush(m);
            }));
            realtime.publishToChannel(channelId, RealtimeEvent.of("AI_STREAM_COMPLETE", channelId, communityId,
                streamPayload(streamId, messageId, threadId, "", fallback, true)));
            realtime.onMessageEdited(communityId, channelId, messageId);
        }
    }

    private String generateMarkdown(Mode mode, String channelName, String prompt, List<ContextItem> contextItems) {
        if (props.externalLlmConfigured()) {
            try {
                String llmText = callExternalLlm(mode, channelName, prompt, contextItems);
                if (llmText != null && !llmText.isBlank()) {
                    return PhiDetector.redact(llmText.trim());
                }
            } catch (Exception ex) {
                log.debug("External Co-Pilot LLM call failed, falling back to local clinical synthesizer: {}", ex.getMessage());
            }
        }
        return ClinicalSynthesizer.synthesize(mode, channelName, prompt, contextItems);
    }

    private String callExternalLlm(Mode mode, String channelName, String prompt, List<ContextItem> contextItems) {
        StringBuilder transcript = new StringBuilder();
        for (ContextItem c : contextItems) {
            transcript.append(c.authorName());
            if (c.specialty() != null && !c.specialty().isBlank()) transcript.append(" (").append(c.specialty()).append(")");
            String snippet = c.text();
            if (snippet.length() > 200) snippet = snippet.substring(0, 197) + "…";
            transcript.append(": ").append(PhiDetector.redact(snippet)).append("\n");
        }
        String systemPrompt = "You are MedCord Clinical Co-Pilot. Be ultra-concise: high-yield bullet points or compact table only. Max 140 words. Never invent patient IDs. Include a brief 1-line disclaimer.";
        String userPrompt = "Mode: " + mode + "\nChannel: #" + channelName + "\n"
            + (prompt != null && !prompt.isBlank() ? "Question: " + PhiDetector.redact(prompt) + "\n" : "")
            + "Context:\n" + transcript;

        Map<String, Object> reqBody = Map.of(
            "model", props.model(),
            "messages", List.of(
                Map.of("role", "system", "content", systemPrompt),
                Map.of("role", "user", "content", userPrompt)
            ),
            "temperature", 0.2,
            "max_tokens", 350
        );
        String raw = http.post()
            .uri(props.apiUrl())
            .contentType(MediaType.APPLICATION_JSON)
            .header("Authorization", "Bearer " + props.apiKey())
            .body(reqBody)
            .retrieve()
            .body(String.class);
        if (raw == null || raw.isBlank()) return null;
        JsonNode root = json.readTree(raw);
        JsonNode choices = root.path("choices");
        if (choices.isArray() && !choices.isEmpty()) {
            return choices.get(0).path("message").path("content").asText(null);
        }
        return null;
    }

    private List<Message> loadContextMessages(UUID channelId, MessageThread thread) {
        List<Message> list = new ArrayList<>();
        if (thread != null) {
            messages.findById(thread.getRootMessageId()).ifPresent(list::add);
            List<Message> replies = new ArrayList<>(messages.latestInThread(thread.getId(), PageRequest.of(0, 5)));
            Collections.reverse(replies);
            list.addAll(replies);
        } else {
            List<Message> latest = new ArrayList<>(messages.latest(channelId, PageRequest.of(0, 5)));
            Collections.reverse(latest);
            list.addAll(latest);
        }
        return list.stream()
            .filter(m -> !m.isDeleted() && !"CALL".equals(m.getKind()) && !"AI".equals(m.getKind()))
            .toList();
    }

    private List<ContextItem> buildContextItems(List<Message> msgs) {
        if (msgs.isEmpty()) return List.of();
        Set<UUID> authorIds = msgs.stream().map(Message::getAuthorId).collect(Collectors.toSet());
        Map<UUID, User> authorMap = users.findAllById(authorIds).stream().collect(Collectors.toMap(User::getId, u -> u));
        Map<UUID, ProfessionalProfile> profMap = profiles.findAllById(authorIds).stream()
            .collect(Collectors.toMap(ProfessionalProfile::getUserId, p -> p));
        Map<UUID, List<AttachmentDto>> attMap = attachments.forMessages(msgs.stream().map(Message::getId).toList());

        List<ContextItem> out = new ArrayList<>();
        for (Message m : msgs) {
            User u = authorMap.get(m.getAuthorId());
            ProfessionalProfile p = profMap.get(m.getAuthorId());
            StringBuilder text = new StringBuilder();
            if (m.getBody() != null && !m.getBody().isBlank()) text.append(m.getBody().trim());
            for (AttachmentDto att : attMap.getOrDefault(m.getId(), List.of())) {
                if (att.transcript() != null && !att.transcript().isBlank()) {
                    if (!text.isEmpty()) text.append(" ");
                    text.append("[Voice transcript] ").append(att.transcript().trim());
                }
            }
            if (!text.isEmpty()) {
                out.add(new ContextItem(
                    u == null ? "Clinician" : u.getDisplayName(),
                    p == null ? null : p.getSpecialty(),
                    text.toString()
                ));
            }
        }
        return out;
    }

    private static Map<String, Object> streamPayload(String streamId, UUID messageId, UUID threadId,
                                                     String delta, String content, boolean completed) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("streamId", streamId);
        m.put("messageId", messageId);
        if (threadId != null) m.put("threadId", threadId);
        m.put("delta", delta);
        m.put("content", content);
        m.put("completed", completed);
        return m;
    }
}
