import { describe, it, expect } from "vitest";
import {
  isAudioOrVideoMedia,
  formatTimestamp,
  extractTopicsFromTranscript,
  formatTranscriptAsMarkdown,
  transcribeMediaFile,
} from "../transcriptionService";

describe("transcriptionService", () => {
  describe("isAudioOrVideoMedia", () => {
    it("identifies audio and video extensions", () => {
      expect(isAudioOrVideoMedia("lecture.mp3")).toBe(true);
      expect(isAudioOrVideoMedia("interview.wav")).toBe(true);
      expect(isAudioOrVideoMedia("seminar.m4a")).toBe(true);
      expect(isAudioOrVideoMedia("talk.mp4")).toBe(true);
      expect(isAudioOrVideoMedia("presentation.mov")).toBe(true);
      expect(isAudioOrVideoMedia("recording.webm")).toBe(true);
      expect(isAudioOrVideoMedia("paper.pdf")).toBe(false);
      expect(isAudioOrVideoMedia("notes.docx")).toBe(false);
    });
  });

  describe("formatTimestamp", () => {
    it("formats seconds into MM:SS and HH:MM:SS", () => {
      expect(formatTimestamp(0)).toBe("00:00");
      expect(formatTimestamp(65)).toBe("01:05");
      expect(formatTimestamp(600)).toBe("10:00");
      expect(formatTimestamp(3665)).toBe("01:01:05");
    });
  });

  describe("extractTopicsFromTranscript", () => {
    it("extracts repeated key terminology", () => {
      const segments = [
        { startTime: 0, endTime: 10, text: "We study neural networks and deep learning models." },
        { startTime: 10, endTime: 20, text: "The deep learning architectures use neural networks for prediction." },
      ];

      const topics = extractTopicsFromTranscript(segments);
      expect(topics).toContain("neural");
      expect(topics).toContain("learning");
    });
  });

  describe("formatTranscriptAsMarkdown", () => {
    it("creates structured markdown with title, duration, and timestamped lines", () => {
      const segments = [
        { startTime: 0, endTime: 60, speaker: "Prof. Smith", text: "Introduction to robotics." },
      ];
      const md = formatTranscriptAsMarkdown("Robotics Lecture 1", 60, segments, "lecture1.mp3");

      expect(md).toContain("# Robotics Lecture 1");
      expect(md).toContain("lecture1.mp3");
      expect(md).toContain("[00:00 - 01:00]");
      expect(md).toContain("**Prof. Smith:** Introduction to robotics.");
    });
  });

  describe("transcribeMediaFile", () => {
    it("transcribes media file into full result with segments and markdown", async () => {
      const mockBlob = new Blob(["mock audio content"], { type: "audio/mp3" });
      const result = await transcribeMediaFile(mockBlob, { filename: "ai_ethics_symposium.mp3" });

      expect(result.title).toBe("ai ethics symposium");
      expect(result.duration).toBeGreaterThan(0);
      expect(result.segments.length).toBeGreaterThan(0);
      expect(result.markdownContent).toContain("# ai ethics symposium");
    });
  });
});
