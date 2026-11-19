package com.medcord.realtime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;

import com.medcord.support.ApiTestSupport;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.mock.web.MockMultipartFile;
import tools.jackson.databind.JsonNode;

class RealtimeChatEnhancementsTest extends ApiTestSupport {
    Acct owner, member, outsider;
    String cid, general;

    @BeforeEach
    void setup() throws Exception {
        owner = acct("Dr Priya", true);
        member = acct("Dr Arjun", true);
        outsider = acct("Dr Outsider", true);
        cid = createCommunity(owner, "Realtime Cardio");
        join(member, cid);
        general = channelId(owner, cid, "general");
    }

    @Test
    void attachmentsStripExifBlockDicomAndEnforceAccess() throws Exception {
        byte[] jpegWithExif = jpegWithFakeExif("PATIENT_NAME_LEAK_TEST");
        assertThat(new String(jpegWithExif, StandardCharsets.ISO_8859_1)).contains("PATIENT_NAME_LEAK_TEST");

        MockMultipartFile validImg = new MockMultipartFile("file", "ecg.jpg", "image/jpeg", jpegWithExif);
        var uploadRes = mvc.perform(multipart("/api/v1/channels/" + general + "/attachments")
                .file(validImg)
                .header("Authorization", "Bearer " + owner.token()))
            .andReturn().getResponse();
        assertThat(uploadRes.getStatus()).isEqualTo(201);
        JsonNode att = json.readTree(uploadRes.getContentAsString());
        assertThat(att.get("exifStripped").asBoolean()).isTrue();
        assertThat(att.get("width").asInt()).isEqualTo(16);
        assertThat(att.get("height").asInt()).isEqualTo(16);
        String attId = att.get("id").asText();

        // Downloaded image has EXIF payload completely stripped
        var dlRes = mvc.perform(get("/api/v1/attachments/" + attId)
                .header("Authorization", "Bearer " + member.token()))
            .andReturn().getResponse();
        assertThat(dlRes.getStatus()).isEqualTo(200);
        assertThat(new String(dlRes.getContentAsByteArray(), StandardCharsets.ISO_8859_1))
            .doesNotContain("PATIENT_NAME_LEAK_TEST");

        // Outsider cannot download
        var denied = mvc.perform(get("/api/v1/attachments/" + attId)
                .header("Authorization", "Bearer " + outsider.token()))
            .andReturn().getResponse();
        assertThat(denied.getStatus()).isEqualTo(403);

        // Attachment-only message works and includes attachment metadata
        JsonNode msg = api(HttpMethod.POST, "/api/v1/channels/" + general + "/messages", owner,
            "{\"body\":\"\",\"attachmentIds\":[\"" + attId + "\"]}", 201);
        assertThat(msg.get("attachments")).hasSize(1);
        assertThat(msg.get("attachments").get(0).get("exifStripped").asBoolean()).isTrue();

        // DICOM files are blocked
        byte[] fakeDicom = new byte[140];
        fakeDicom[128] = 'D'; fakeDicom[129] = 'I'; fakeDicom[130] = 'C'; fakeDicom[131] = 'M';
        MockMultipartFile dicom = new MockMultipartFile("file", "scan.dcm", "application/dicom", fakeDicom);
        var dicomRes = mvc.perform(multipart("/api/v1/channels/" + general + "/attachments")
                .file(dicom)
                .header("Authorization", "Bearer " + owner.token()))
            .andReturn().getResponse();
        assertThat(dicomRes.getStatus()).isEqualTo(400);
        assertThat(dicomRes.getContentAsString()).contains("DICOM");
    }

    @Test
    void mentionsUnreadTrackingAndNotificationPrefs() throws Exception {
        // Regular member cannot use @everyone
        api(HttpMethod.POST, "/api/v1/channels/" + general + "/messages", member,
            "{\"body\":\"Hey @everyone check this\"}", 403);

        // Owner CAN mention @everyone and @Dr Arjun
        JsonNode m1 = api(HttpMethod.POST, "/api/v1/channels/" + general + "/messages", owner,
            "{\"body\":\"@Dr Arjun please review the cath lab protocol\"}", 201);

        // Member sees 1 unread + 1 mention in unreads and in /me/mentions
        JsonNode unreads = api(HttpMethod.GET, "/api/v1/me/unreads", member, null, 200);
        JsonNode genUnread = findBy(unreads, "channelId", general);
        assertThat(genUnread).isNotNull();
        assertThat(genUnread.get("unreadCount").asLong()).isEqualTo(1);
        assertThat(genUnread.get("mentionCount").asLong()).isEqualTo(1);

        JsonNode mentions = api(HttpMethod.GET, "/api/v1/me/mentions", member, null, 200);
        assertThat(mentions).hasSize(1);
        assertThat(mentions.get(0).get("mentionKind").asText()).isEqualTo("USER");
        assertThat(mentions.get(0).get("unread").asBoolean()).isTrue();

        // Marking channel read clears unread count
        api(HttpMethod.POST, "/api/v1/channels/" + general + "/read", member,
            "{\"messageId\":\"" + m1.get("id").asText() + "\"}", 204);
        JsonNode afterRead = findBy(api(HttpMethod.GET, "/api/v1/me/unreads", member, null, 200), "channelId", general);
        assertThat(afterRead.get("unreadCount").asLong()).isEqualTo(0);

        // DND & channel notification level preferences persist
        JsonNode prefs = api(HttpMethod.PUT, "/api/v1/me/notification-prefs", member,
            "{\"dndEnabled\":true,\"dndStart\":\"22:00\",\"dndEnd\":\"07:00\",\"showToasts\":true}", 200);
        assertThat(prefs.get("dndEnabled").asBoolean()).isTrue();
        assertThat(prefs.get("dndActiveNow").asBoolean()).isTrue();
        JsonNode muted = api(HttpMethod.PUT, "/api/v1/me/notification-prefs/channels/" + general, member,
            "{\"level\":\"MUTE\"}", 200);
        assertThat(muted.get("channelLevels").get(general).asText()).isEqualTo("MUTE");
    }

    @Test
    void bookmarksAndTypingWorkEndToEnd() throws Exception {
        JsonNode msg = api(HttpMethod.POST, "/api/v1/channels/" + general + "/messages", owner,
            "{\"body\":\"**Pearl:** Check Mg2+ before correcting refractory K+.\"}", 201);
        String msgId = msg.get("id").asText();

        JsonNode saved = api(HttpMethod.PUT, "/api/v1/messages/" + msgId + "/bookmark", member,
            "{\"note\":\"Electrolyte protocol\"}", 200);
        assertThat(saved.get("bookmarked").asBoolean()).isTrue();

        JsonNode list = api(HttpMethod.GET, "/api/v1/me/bookmarks", member, null, 200);
        assertThat(list).hasSize(1);
        assertThat(list.get(0).get("note").asText()).isEqualTo("Electrolyte protocol");

        JsonNode removed = api(HttpMethod.DELETE, "/api/v1/messages/" + msgId + "/bookmark", member, null, 200);
        assertThat(removed.get("bookmarked").asBoolean()).isFalse();
        assertThat(api(HttpMethod.GET, "/api/v1/me/bookmarks", member, null, 200)).isEmpty();

        // Typing indicator accepted for members, forbidden for outsiders
        api(HttpMethod.POST, "/api/v1/channels/" + general + "/typing", member, null, 204);
        api(HttpMethod.POST, "/api/v1/channels/" + general + "/typing", outsider, null, 403);
    }

    @Test
    void voiceRoomLifecycleAndScreenSharing() throws Exception {
        JsonNode voice = api(HttpMethod.POST, "/api/v1/communities/" + cid + "/channels", owner,
            "{\"name\":\"cath-rounds\",\"topic\":\"Case huddle\",\"type\":\"VOICE\"}", 201);
        String voiceId = voice.get("id").asText();

        JsonNode joined1 = api(HttpMethod.POST, "/api/v1/channels/" + voiceId + "/voice/join", owner,
            "{\"micOn\":true,\"camOn\":false}", 200);
        assertThat(joined1.get("participants")).hasSize(1);

        JsonNode joined2 = api(HttpMethod.POST, "/api/v1/channels/" + voiceId + "/voice/join", member,
            "{\"micOn\":true,\"camOn\":true}", 200);
        assertThat(joined2.get("participants")).hasSize(2);

        JsonNode sharing = api(HttpMethod.PATCH, "/api/v1/channels/" + voiceId + "/voice/state", owner,
            "{\"screenSharing\":true}", 200);
        assertThat(sharing.get("participants").get(0).get("screenSharing").asBoolean()).isTrue();

        // Signaling between active participants succeeds
        api(HttpMethod.POST, "/api/v1/channels/" + voiceId + "/voice/signal", owner,
            "{\"toUserId\":\"" + member.id() + "\",\"kind\":\"offer\",\"data\":{\"sdp\":\"v=0\"}}", 204);

        // Community voice room listing reflects live participants
        JsonNode rooms = api(HttpMethod.GET, "/api/v1/communities/" + cid + "/voice-rooms", member, null, 200);
        assertThat(rooms).hasSize(1);
        assertThat(rooms.get(0).get("participants")).hasSize(2);

        // Outsider cannot join
        api(HttpMethod.POST, "/api/v1/channels/" + voiceId + "/voice/join", outsider, "{}", 403);

        // Leave removes participant
        api(HttpMethod.POST, "/api/v1/channels/" + voiceId + "/voice/leave", owner, null, 204);
        JsonNode afterLeave = api(HttpMethod.GET, "/api/v1/channels/" + voiceId + "/voice", member, null, 200);
        assertThat(afterLeave.get("participants")).hasSize(1);
    }

    private static JsonNode findBy(JsonNode arr, String field, String expected) {
        for (JsonNode n : arr) {
            if (expected.equals(n.get(field).asText())) return n;
        }
        return null;
    }

    /** Creates a valid 16x16 JPEG and injects a synthetic EXIF APP1 segment right after SOI (FF D8). */
    private static byte[] jpegWithFakeExif(String markerText) throws Exception {
        BufferedImage img = new BufferedImage(16, 16, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = img.createGraphics();
        g.setColor(Color.BLUE);
        g.fillRect(0, 0, 16, 16);
        g.dispose();
        ByteArrayOutputStream base = new ByteArrayOutputStream();
        ImageIO.write(img, "jpg", base);
        byte[] jpeg = base.toByteArray();

        byte[] payload = ("Exif\0\0" + markerText).getBytes(StandardCharsets.ISO_8859_1);
        int segLen = payload.length + 2;
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.write(jpeg, 0, 2); // SOI FF D8
        out.write(0xFF); out.write(0xE1); // APP1 EXIF marker
        out.write((segLen >> 8) & 0xFF); out.write(segLen & 0xFF);
        out.write(payload);
        out.write(jpeg, 2, jpeg.length - 2);
        return out.toByteArray();
    }
}
