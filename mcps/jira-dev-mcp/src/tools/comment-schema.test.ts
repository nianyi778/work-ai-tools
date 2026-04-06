import { describe, expect, it } from 'vitest';
import { addCommentSchema, editCommentSchema } from './comment.js';

describe('addCommentSchema refine', () => {
  it('passes when key and body are provided', () => {
    expect(() => addCommentSchema.parse({ key: 'AT-1', body: 'hello' })).not.toThrow();
  });

  it('passes when only confirm_token is provided (token-only confirm flow)', () => {
    expect(() => addCommentSchema.parse({ confirm_token: 'tok-abc' })).not.toThrow();
  });

  it('passes when all three fields are provided', () => {
    expect(() => addCommentSchema.parse({ key: 'AT-1', body: 'hello', confirm_token: 'tok' })).not.toThrow();
  });

  it('fails when all fields are absent', () => {
    expect(() => addCommentSchema.parse({})).toThrow('requires key and body');
  });

  it('fails when only key is provided (missing body)', () => {
    expect(() => addCommentSchema.parse({ key: 'AT-1' })).toThrow('requires key and body');
  });

  it('fails when only body is provided (missing key)', () => {
    expect(() => addCommentSchema.parse({ body: 'hello' })).toThrow('requires key and body');
  });
});

describe('editCommentSchema refine', () => {
  it('passes when key, commentId, and body are all provided', () => {
    expect(() => editCommentSchema.parse({ key: 'AT-1', commentId: 'c-1', body: 'updated' })).not.toThrow();
  });

  it('passes when only confirm_token is provided', () => {
    expect(() => editCommentSchema.parse({ confirm_token: 'tok-abc' })).not.toThrow();
  });

  it('fails when all fields are absent', () => {
    expect(() => editCommentSchema.parse({})).toThrow('requires key, commentId, and body');
  });

  it('fails when commentId is missing', () => {
    expect(() => editCommentSchema.parse({ key: 'AT-1', body: 'updated' })).toThrow('requires key, commentId, and body');
  });

  it('fails when body is missing', () => {
    expect(() => editCommentSchema.parse({ key: 'AT-1', commentId: 'c-1' })).toThrow('requires key, commentId, and body');
  });
});
