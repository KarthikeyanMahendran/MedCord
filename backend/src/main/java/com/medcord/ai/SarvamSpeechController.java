package com.medcord.ai;

import com.medcord.common.ApiException;
import java.io.IOException;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.multipart.MultipartFile;

/**
 * Indian-language speech and translation through Sarvam AI: speech to text, text to speech and translation.
 * The API key stays on the server; the browser only talks to these endpoints.
 */
@RestController
@RequestMapping("/api/v1/ai")
public class SarvamSpeechController {
    private static final String BASE = "https://api.sarvam.ai";
    private static final Set<String> LANGS = Set.of("en-IN", "hi-IN", "ta-IN", "te-IN", "kn-IN", "ml-IN", "bn-IN", "mr-IN", "gu-IN", "pa-IN", "od-IN");

    public record TranslateRequest(String text, String target, String source) {}
    public record TranslateResponse(String text) {}
    public record SpeakRequest(String text, String language) {}
    public record TranscribeResponse(String text, String language) {}

    private final AiProperties props;
    private final RestClient http;

    public SarvamSpeechController(AiProperties props) {
        this.props = props;
        SimpleClientHttpRequestFactory f = new SimpleClientHttpRequestFactory();
        f.setConnectTimeout(8000);
        f.setReadTimeout(30000);
        this.http = RestClient.builder().baseUrl(BASE).requestFactory(f).build();
    }

    private String key() {
        String k = props.getSarvamApiKey();
        if (k == null || k.isBlank()) throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "Language services are not set up");
        return k;
    }

    private static String lang(String code, String fallback) {
        String c = code == null || code.isBlank() ? fallback : code;
        if (!LANGS.contains(c)) throw new ApiException(HttpStatus.BAD_REQUEST, "That language is not supported");
        return c;
    }

    @PostMapping("/translate")
    public TranslateResponse translate(@RequestBody TranslateRequest r) {
        String text = r.text() == null ? "" : r.text().strip();
        if (text.isEmpty() || text.length() > 1000) throw new ApiException(HttpStatus.BAD_REQUEST, "Send between 1 and 1000 characters");
        String target = lang(r.target(), "en-IN");
        String source = r.source() == null || r.source().isBlank() ? "auto" : lang(r.source(), "en-IN");
        try {
            Map<?, ?> out = http.post().uri("/translate").header("api-subscription-key", key()).contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("input", text, "source_language_code", source, "target_language_code", target, "model", "mayura:v1", "mode", "formal"))
                .retrieve().body(Map.class);
            Object t = out == null ? null : out.get("translated_text");
            if (t == null) throw new ApiException(HttpStatus.BAD_GATEWAY, "Translation failed");
            return new TranslateResponse(t.toString());
        } catch (RestClientException e) { throw new ApiException(HttpStatus.BAD_GATEWAY, "Translation is unavailable right now"); }
    }

    @PostMapping(value = "/text-to-speech", produces = "audio/wav")
    public ResponseEntity<byte[]> speak(@RequestBody SpeakRequest r) {
        String text = r.text() == null ? "" : r.text().strip();
        if (text.isEmpty() || text.length() > 1500) throw new ApiException(HttpStatus.BAD_REQUEST, "Send between 1 and 1500 characters");
        String language = lang(r.language(), "en-IN");
        try {
            Map<?, ?> out = http.post().uri("/text-to-speech").header("api-subscription-key", key()).contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("text", text, "target_language_code", language, "speaker", "priya", "model", "bulbul:v3"))
                .retrieve().body(Map.class);
            Object audios = out == null ? null : out.get("audios");
            if (!(audios instanceof List<?> l) || l.isEmpty()) throw new ApiException(HttpStatus.BAD_GATEWAY, "Could not read this aloud");
            return ResponseEntity.ok().contentType(MediaType.parseMediaType("audio/wav")).body(Base64.getDecoder().decode(l.get(0).toString()));
        } catch (RestClientException e) { throw new ApiException(HttpStatus.BAD_GATEWAY, "Reading aloud is unavailable right now"); }
    }

    @PostMapping(value = "/speech-to-text", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public TranscribeResponse transcribe(@RequestPart("audio") MultipartFile audio, @RequestParam(required = false) String language) throws IOException {
        if (audio.isEmpty() || audio.getSize() > 8L * 1024 * 1024) throw new ApiException(HttpStatus.BAD_REQUEST, "Send a recording up to 8 MB");
        String code = language == null || language.isBlank() ? "unknown" : lang(language, "en-IN");
        String name = audio.getOriginalFilename() == null || audio.getOriginalFilename().isBlank() ? "speech.webm" : audio.getOriginalFilename();
        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        body.add("file", new ByteArrayResource(audio.getBytes()) { @Override public String getFilename() { return name; } });
        body.add("model", "saarika:v2.5");
        body.add("language_code", code);
        try {
            Map<?, ?> out = http.post().uri("/speech-to-text").header("api-subscription-key", key()).contentType(MediaType.MULTIPART_FORM_DATA).body(body).retrieve().body(Map.class);
            Object t = out == null ? null : out.get("transcript");
            Object l = out == null ? null : out.get("language_code");
            return new TranscribeResponse(t == null ? "" : t.toString(), l == null ? code : l.toString());
        } catch (RestClientException e) { throw new ApiException(HttpStatus.BAD_GATEWAY, "Could not turn the recording into text. Try again."); }
    }
}
