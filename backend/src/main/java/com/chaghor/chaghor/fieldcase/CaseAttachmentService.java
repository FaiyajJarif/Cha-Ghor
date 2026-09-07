package com.chaghor.chaghor.fieldcase;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;

// Stores evidence attached to a complaint or field report: a photo of a damaged
// roof, a scanned form, a PDF.
//
// SECURITY, because this accepts files from the field:
//
//  1. The user's filename is NEVER used on disk. Files are stored as a fresh
//     UUID plus an extension we chose. That removes path traversal
//     ("../../application.yaml"), null bytes, unicode tricks and collisions in
//     one move.
//  2. The extension is derived from the declared content type, which must be on
//     a small allow-list. A .exe renamed to .png cannot get in, because we
//     never trust the name in the first place.
//  3. The magic bytes are checked against the declared type, so a file that
//     merely CLAIMS to be a PNG is rejected. Declared type alone is caller-
//     controlled and worth nothing on its own.
//  4. Reads validate the stored name against a strict UUID pattern before
//     touching the filesystem, and the resolved path is confirmed to still be
//     inside the upload directory.
//
// AUDIO IS ACCEPTED so a worker who cannot write can say what happened instead.
// Which container arrives depends entirely on the browser -- Chrome and Brave
// record audio/webm, Safari audio/mp4, Firefox audio/ogg -- so all three are on
// the list. They are stored and served untouched; nothing here transcodes.
//
// The 10MB cap still applies, which at the ~24kbps Opus a phone produces is
// roughly an hour. The recorder in the UI stops at two minutes anyway.
//
// Video is deliberately not accepted: the multipart cap is 10MB, which most
// phone video exceeds within seconds, and there is no transcoding here.
@Service
public class CaseAttachmentService {

    // Declared content type -> the extension we will actually use.
    private static final Map<String, String> ALLOWED = Map.of(
            "image/png", "png",
            "image/jpeg", "jpg",
            "image/webp", "webp",
            "application/pdf", "pdf",
            // MediaRecorder appends codec parameters -- "audio/webm;codecs=opus"
            // -- so the declared type is stripped at the semicolon before this
            // lookup. Without that every recording is rejected as unknown.
            "audio/webm", "weba",
            "audio/mp4", "m4a",
            "audio/ogg", "oga");

    // Only ever read a name that looks exactly like something we wrote.
    private static final Pattern STORED_NAME =
            Pattern.compile("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
                            + "\\.(png|jpg|webp|pdf|weba|m4a|oga)$");

    private static final long MAX_BYTES = 10L * 1024 * 1024; // matches spring.servlet.multipart

    private final Path root;

    public CaseAttachmentService(@Value("${app.uploads.dir:uploads}") String uploadsDir) {
        this.root = Paths.get(uploadsDir, "cases").toAbsolutePath().normalize();
    }

    public String store(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No file was uploaded.");
        }
        if (file.getSize() > MAX_BYTES) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "That file is larger than 10MB. Please attach a smaller photo or PDF.");
        }
        String declared = file.getContentType() == null
                ? "" : file.getContentType().toLowerCase().trim();
        // "audio/webm;codecs=opus" -> "audio/webm". MediaRecorder always sends
        // the codec parameter; the allow-list is keyed on the bare type.
        int semi = declared.indexOf(';');
        if (semi >= 0) {
            declared = declared.substring(0, semi).trim();
        }
        String ext = ALLOWED.get(declared);
        if (ext == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Only PNG, JPG, WEBP images, PDF files and voice recordings "
                            + "can be attached.");
        }

        byte[] head = new byte[12];
        int read;
        try (InputStream in = file.getInputStream()) {
            read = in.readNBytes(head, 0, head.length);
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The uploaded file could not be read.");
        }
        if (!looksLike(declared, head, read)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "That file does not look like a real " + ext.toUpperCase()
                            + ". Please attach the original file.");
        }

        String storedName = UUID.randomUUID() + "." + ext;
        try {
            Files.createDirectories(root);
            Path target = root.resolve(storedName).normalize();
            // Belt and braces: the resolved path must still be inside root.
            if (!target.startsWith(root)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid file name.");
            }
            try (InputStream in = file.getInputStream()) {
                Files.copy(in, target, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "The attachment could not be saved. Please try again.");
        }
        return storedName;
    }

    public byte[] read(String storedName) {
        Path target = resolve(storedName);
        try {
            return Files.readAllBytes(target);
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "That attachment is no longer available.");
        }
    }

    public String contentTypeOf(String storedName) {
        String ext = storedName.substring(storedName.lastIndexOf('.') + 1).toLowerCase();
        return switch (ext) {
            case "png" -> "image/png";
            case "jpg" -> "image/jpeg";
            case "webp" -> "image/webp";
            case "pdf" -> "application/pdf";
            case "weba" -> "audio/webm";
            case "m4a" -> "audio/mp4";
            case "oga" -> "audio/ogg";
            default -> "application/octet-stream";
        };
    }

    private Path resolve(String storedName) {
        if (storedName == null || !STORED_NAME.matcher(storedName).matches()) {
            // Anything not matching a UUID we generated is rejected before the
            // filesystem is touched at all.
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "That attachment could not be found.");
        }
        Path target = root.resolve(storedName).normalize();
        if (!target.startsWith(root) || !Files.isRegularFile(target)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "That attachment could not be found.");
        }
        return target;
    }

    // Magic-byte check. Cheap, and it is what stops a declared content type
    // from being taken on trust.
    private static boolean looksLike(String declared, byte[] b, int read) {
        if (read < 4) {
            return false;
        }
        return switch (declared) {
            // \x89 P N G
            case "image/png" -> (b[0] & 0xFF) == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G';
            // JPEG SOI marker FF D8 FF
            case "image/jpeg" -> (b[0] & 0xFF) == 0xFF && (b[1] & 0xFF) == 0xD8 && (b[2] & 0xFF) == 0xFF;
            // RIFF....WEBP
            case "image/webp" -> read >= 12 && b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F'
                    && b[8] == 'W' && b[9] == 'E' && b[10] == 'B' && b[11] == 'P';
            // %PDF
            case "application/pdf" -> b[0] == '%' && b[1] == 'P' && b[2] == 'D' && b[3] == 'F';
            // WebM is Matroska: EBML header 1A 45 DF A3.
            case "audio/webm" -> (b[0] & 0xFF) == 0x1A && (b[1] & 0xFF) == 0x45
                    && (b[2] & 0xFF) == 0xDF && (b[3] & 0xFF) == 0xA3;
            // ISO-BMFF: a size field, then 'ftyp' at offset 4. The first four
            // bytes are the box length, so they cannot be checked.
            case "audio/mp4" -> read >= 8 && b[4] == 'f' && b[5] == 't' && b[6] == 'y' && b[7] == 'p';
            // Ogg page header 'OggS'.
            case "audio/ogg" -> b[0] == 'O' && b[1] == 'g' && b[2] == 'g' && b[3] == 'S';
            default -> false;
        };
    }
}
