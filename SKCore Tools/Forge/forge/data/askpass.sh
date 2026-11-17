#!/bin/sh
case "$1" in
*Username*) printf '%s\n' x-access-token ;;
*) printf '%s\n' "$FORGE_GIT_TOKEN" ;;
esac
